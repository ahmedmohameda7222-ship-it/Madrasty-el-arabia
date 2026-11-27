-- General verified refunds reuse the existing outward-money journal and reference uniqueness.
-- Stop-related funds retain their dedicated review workflow.
alter table app.stop_cash_refund alter column review_id drop not null;
alter table app.stop_cash_refund add column invoice_id uuid references app.invoice;
alter table app.stop_cash_refund add column reason text;
alter table app.stop_cash_refund add column reallocated_minor bigint not null default 0 check(reallocated_minor>=0);
alter table app.stop_cash_refund add constraint refund_source_check check(
  (review_id is not null and invoice_id is null and reason is null and reallocated_minor=0)
  or (review_id is null and reason is not null and char_length(btrim(reason)) between 3 and 500)
);
create index general_refund_invoice on app.stop_cash_refund(invoice_id) where review_id is null;

create function app.receipt_refund_details(target uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'amountMinor',f.amount_minor,'refundedDate',f.refunded_date::text)
    order by f.posted_at desc,f.id),'[]'::jsonb)
  from app.stop_cash_refund f
  left join app.stop_review review on review.id=f.review_id
  left join app.invoice j on j.id=coalesce(f.invoice_id,review.invoice_id)
  where (app.finance_receipt_staff() and f.receipt_id=target)
    or (app.actor_persona()='guardian' and j.payer_account_id=app.actor_account()
      and exists(select 1 from app.payer_receipt p where p.id=target and p.receipt_id=f.receipt_id and p.payer_id=app.actor_account()))
$$;

create function app.record_receipt_refund(target uuid,expected integer,allocation_key uuid,returned_date date,amount bigint,external_ref text,explanation text,verified boolean)
returns table(id uuid,revision integer,reversal_posting jsonb,allocation_posting jsonb)
language plpgsql volatile security definer set search_path=pg_catalog
as $$
declare receipt app.finance_receipt%rowtype;
declare allocation app.receipt_allocation%rowtype;
declare m record;
declare invoice_key uuid;
declare remaining bigint:=0;
declare invoice_revision integer;
declare refund_key uuid;
declare reversed jsonb;
declare allocated jsonb;
declare next_revision integer;
declare available_cash bigint;
begin
  if not app.has_capability('finance.post') or not app.finance_receipt_posting_target(target) then
    raise exception 'Receipt unavailable' using errcode='42501';
  end if;
  perform app.lock_school_calendar();
  select r.* into receipt from app.finance_receipt r where r.id=target for update;
  if not found then return; end if;
  select * into m from app.receipt_money(target,'infinity'::timestamptz);
  if m.revision<>expected or m.voided then return; end if;
  if exists(select 1 from app.stop_review_fund f where f.receipt_id=target) then
    raise exception 'Use the participation fee review for these funds' using errcode='23514';
  end if;
  if verified is distinct from true or returned_date is null or returned_date<receipt.received_date or returned_date>app.school_today()
    or amount is null or amount<1 or explanation is null or char_length(btrim(explanation)) not between 3 and 500 then
    raise exception 'Invalid verified refund' using errcode='23514';
  end if;
  if receipt.method='cash' then
    select coalesce(sum(a.signed_minor),0)::bigint into available_cash from app.cashbook_all() a
      where a.currency=receipt.currency::text and a.movement_date<=app.school_today();
    if amount>available_cash then raise exception 'Insufficient cash for refund' using errcode='23514'; end if;
  end if;
  next_revision:=expected;
  if allocation_key is not null then
    select a.* into allocation from app.receipt_allocation a where a.id=allocation_key and a.receipt_id=target
      and not exists(select 1 from app.receipt_reversal x where x.allocation_id=a.id);
    if not found or amount>allocation.amount_minor then raise exception 'Refund exceeds allocation' using errcode='23514'; end if;
    invoice_key:=allocation.invoice_id;
    perform app.lock_receipt_invoices(array[invoice_key]);
    remaining:=allocation.amount_minor-amount;
    select r.posting,r.revision into reversed,next_revision
      from app.reverse_finance_receipt(target,expected,'unapply',array[allocation_key],btrim(explanation)) r;
    if not found then raise exception 'Concurrent receipt correction' using errcode='40001'; end if;
    if remaining>0 then
      select j.revision into invoice_revision from app.invoice j where j.id=invoice_key;
      select r.posting,r.revision into allocated,next_revision from app.allocate_finance_receipt(target,next_revision,
        jsonb_build_array(jsonb_build_object('invoiceId',invoice_key,'amountMinor',remaining,'invoiceRevision',invoice_revision))) r;
      if not found then raise exception 'Concurrent receipt allocation' using errcode='40001'; end if;
    end if;
  else
    if amount>m.remainder_minor-app.finance_refunded_minor(target,'infinity'::timestamptz) then
      raise exception 'Refund exceeds unallocated funds' using errcode='23514';
    end if;
    -- The unallocated remainder has no invoice attribution. It is staff-only, never inferred from a student's name.
  end if;
  select * into m from app.receipt_money(target,'infinity'::timestamptz);
  if amount>m.remainder_minor-app.finance_refunded_minor(target,'infinity'::timestamptz) then
    raise exception 'Refund exceeds available funds' using errcode='23514';
  end if;
  insert into app.stop_cash_refund as f(review_id,receipt_id,invoice_id,external_ref,refunded_date,amount_minor,posted_by,reason,reallocated_minor)
    values(null,target,invoice_key,btrim(external_ref),returned_date,amount,app.actor_account(),btrim(explanation),remaining) returning f.id into refund_key;
  insert into app.receipt_posting(receipt_id,revision,kind,reason,actor_id,posted_at)
    values(target,next_revision+1,'refund',btrim(explanation),app.actor_account(),clock_timestamp());
  return query select refund_key,next_revision+1,reversed,allocated;
end
$$;

create or replace function app.finance_report_lines(cutoff timestamptz,day_key date,month_key date,class_key uuid,pupil uuid,status_key text,
  received_from date,received_through date,after_at timestamptz,after_kind text,after_id uuid,row_limit integer)
returns table(id uuid,kind text,occurred_at timestamptz,invoice_id uuid,invoice_number text,student_id uuid,student_name text,
  student_number text,period date,payer_name text,class_code text,due_date date,receipt_id uuid,receipt_number text,
  received_date date,currency text,amount_minor bigint,balance_minor bigint,state text)
language sql stable security definer set search_path=pg_catalog
as $$
  with invoices as materialized (
    select * from app.finance_report_invoices(cutoff,day_key,month_key,class_key,pupil,status_key)
  ), scoped_allocations as materialized (
    select a.id as allocation_id,a.amount_minor,j.*,p.posted_at,r.received_date,
      case when app.finance_report_scope()='payer' then own.id else r.id end as receipt_id,
      case when app.finance_report_scope()='payer' then own.receipt_number else r.receipt_number end as receipt_number,
      q.id as reversal_id,q.posted_at as reversed_at
    from invoices j join app.receipt_allocation a on a.invoice_id=j.id
    join app.receipt_posting p on p.id=a.posting_id and p.posted_at<cutoff
    join app.finance_receipt r on r.id=a.receipt_id
    left join app.payer_receipt own on own.receipt_id=r.id and own.payer_id=j.payer_id
    left join app.receipt_reversal x on x.allocation_id=a.id
    left join app.receipt_posting q on q.id=x.posting_id and q.posted_at<cutoff
    where (received_from is null or r.received_date>=received_from) and (received_through is null or r.received_date<=received_through)
  ), report(id,kind,occurred_at,invoice_id,invoice_number,student_id,student_name,student_number,period,payer_name,class_code,
    due_date,receipt_id,receipt_number,received_date,currency,amount_minor,balance_minor,state) as (
    select j.id,'invoice'::text,j.issued_at,j.id,j.invoice_number,j.student_id,j.student_name,j.student_number,j.period,j.payer_name,
      case when app.finance_report_scope()='staff' then class.code end,j.due_date,null::uuid,null::text,null::date,j.currency,j.collectible_minor,j.balance_minor,
      case when j.overdue then 'overdue' else j.state end
    from invoices j left join app.school_class class on class.id=j.class_id
    union all
    select a.allocation_id,'allocation',a.posted_at,a.id,a.invoice_number,a.student_id,a.student_name,a.student_number,a.period,a.payer_name,
      case when app.finance_report_scope()='staff' then class.code end,a.due_date,a.receipt_id,a.receipt_number,a.received_date,a.currency,a.amount_minor,a.balance_minor,
      case when a.overdue then 'overdue' else a.state end
    from scoped_allocations a left join app.school_class class on class.id=a.class_id
    union all
    select a.allocation_id,'reversal',a.reversed_at,a.id,a.invoice_number,a.student_id,a.student_name,a.student_number,a.period,a.payer_name,
      case when app.finance_report_scope()='staff' then class.code end,a.due_date,a.receipt_id,a.receipt_number,a.received_date,a.currency,a.amount_minor,a.balance_minor,
      case when a.overdue then 'overdue' else a.state end
    from scoped_allocations a left join app.school_class class on class.id=a.class_id where a.reversal_id is not null
    union all
    select p.id,p.kind,p.posted_at,null,null,null,null,null,null,null,null,null,r.id,r.receipt_number,r.received_date,r.currency::text,
      r.amount_minor,m.remainder_minor-app.finance_refunded_minor(r.id,cutoff),
      case when m.voided then 'voided' when m.remainder_minor>app.finance_refunded_minor(r.id,cutoff) then 'needs_matching' else 'allocated' end
    from app.finance_receipt r join app.receipt_posting p on p.receipt_id=r.id and p.kind in ('record','void_receipt') and p.posted_at<cutoff
    cross join lateral app.receipt_money(r.id,cutoff) m
    where app.finance_report_scope()='staff' and month_key is null and class_key is null and pupil is null and status_key is null
      and (received_from is null or r.received_date>=received_from) and (received_through is null or r.received_date<=received_through)
    union all
    select a.id,'adjustment',a.posted_at,j.id,j.invoice_number,j.student_id,j.student_name,j.student_number,j.period,j.payer_name,
      case when app.finance_report_scope()='staff' then class.code end,j.due_date,null,null,null,j.currency,-a.signed_minor,j.balance_minor,j.state
    from invoices j join app.stop_charge_adjustment a on a.invoice_id=j.id and a.posted_at<cutoff
    left join app.school_class class on class.id=j.class_id
    union all
    select f.id,'refund',f.posted_at,j.id,j.invoice_number,j.student_id,j.student_name,j.student_number,j.period,j.payer_name,
      case when app.finance_report_scope()='staff' then class.code end,j.due_date,
      case when app.finance_report_scope()='staff' then r.id else own.id end,
      case when app.finance_report_scope()='staff' then r.receipt_number else own.receipt_number end,
      f.refunded_date,j.currency,f.amount_minor,j.balance_minor,j.state
    from invoices j join app.stop_cash_refund f on f.posted_at<cutoff and
      (f.invoice_id=j.id or exists(select 1 from app.stop_review review where review.id=f.review_id and review.invoice_id=j.id))
    join app.finance_receipt r on r.id=f.receipt_id
    left join app.payer_receipt own on own.receipt_id=r.id and own.payer_id=j.payer_id
    left join app.school_class class on class.id=j.class_id
    where (received_from is null or r.received_date>=received_from) and (received_through is null or r.received_date<=received_through)
    union all
    select f.id,'refund',f.posted_at,null,null,null,null,null,null,null,null,null,r.id,r.receipt_number,
      f.refunded_date,r.currency::text,f.amount_minor,m.remainder_minor-app.finance_refunded_minor(r.id,cutoff),
      case when m.remainder_minor>app.finance_refunded_minor(r.id,cutoff) then 'needs_matching' else 'allocated' end
    from app.stop_cash_refund f join app.finance_receipt r on r.id=f.receipt_id
    cross join lateral app.receipt_money(r.id,cutoff) m
    where f.review_id is null and f.invoice_id is null and f.posted_at<cutoff
      and app.finance_report_scope()='staff' and month_key is null and class_key is null and pupil is null and status_key is null
      and (received_from is null or r.received_date>=received_from) and (received_through is null or r.received_date<=received_through)
  )
  select row.* from report row
  where app.finance_report_scope() is not null and (after_id is null or (row.occurred_at,row.kind,row.id)<(after_at,after_kind,after_id))
  order by row.occurred_at desc,row.kind desc,row.id desc limit greatest(1,least(row_limit,25001))
$$;

create or replace function app.receipt_payer_document(target uuid)
returns table(id uuid,receipt_number text,method text,received_date date,currency text,recorded_at timestamptz,original_minor bigint,
  applied_minor bigint,allocations jsonb)
language sql stable security definer set search_path=pg_catalog
as $$
  select own.id,own.receipt_number,r.method,r.received_date,r.currency::text,r.recorded_at,
    totals.original-coalesce((select sum(f.reallocated_minor)::bigint from app.stop_cash_refund f
      join app.invoice j on j.id=f.invoice_id where f.receipt_id=r.id and j.payer_account_id=own.payer_id),0),totals.applied,app.receipt_allocation_details(r.id,own.payer_id)
  from app.payer_receipt own join app.finance_receipt r on r.id=own.receipt_id
  cross join lateral (
    select coalesce(sum(a.amount_minor),0)::bigint as original,
      coalesce(sum(a.amount_minor) filter(where x.allocation_id is null),0)::bigint as applied
    from app.receipt_allocation a join app.invoice j on j.id=a.invoice_id and j.payer_account_id=own.payer_id
    left join app.receipt_reversal x on x.allocation_id=a.id where a.receipt_id=r.id
  ) totals
  where app.actor_persona()='guardian' and own.id=target and own.payer_id=app.actor_account()
$$;
revoke all on function app.receipt_refund_details(uuid),app.record_receipt_refund(uuid,integer,uuid,date,bigint,text,text,boolean) from public,anon,authenticated,service_role;
grant execute on function app.receipt_refund_details(uuid),app.record_receipt_refund(uuid,integer,uuid,date,bigint,text,text,boolean) to app_runtime;
