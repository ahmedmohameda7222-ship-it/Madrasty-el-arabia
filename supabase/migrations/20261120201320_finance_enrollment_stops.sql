create table app.enrollment_stop (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references app.student,
  requester_id uuid not null references app.account,
  last_month date not null check(extract(day from last_month)=1),
  start_month date not null check(extract(day from start_month)=1),
  end_month date,
  duration text not null check(duration in ('one_month','indefinite')),
  reason text not null check(char_length(btrim(reason)) between 3 and 800),
  state text not null default 'pending' check(state in ('pending','withdrawn','approved','rejected')),
  decision_note text check(decision_note is null or char_length(btrim(decision_note)) between 1 and 800),
  revision integer not null default 1 check(revision between 1 and 2),
  created_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  resolved_by uuid references app.account,
  check(start_month=(last_month+interval '1 month')::date),
  check(case duration when 'one_month' then end_month is not null and end_month=(start_month+interval '1 month')::date
    else end_month is null end),
  check((state='pending')=(resolved_at is null and resolved_by is null)),
  exclude using gist(student_id with =,daterange(start_month,end_month,'[)') with &&) where(state in ('pending','approved'))
);
create index enrollment_stop_requester_idx on app.enrollment_stop(requester_id,created_at desc,id desc);
create index enrollment_stop_queue_idx on app.enrollment_stop(state,created_at desc,id desc);
alter table app.enrollment_stop enable row level security;

create table app.stop_review (
  id uuid primary key default gen_random_uuid(),
  stop_id uuid not null references app.enrollment_stop,
  invoice_id uuid not null unique references app.invoice,
  original_allocated_minor bigint not null check(original_allocated_minor>=0),
  state text not null default 'open' check(state in ('open','waived','retained')),
  revision integer not null default 1 check(revision>0),
  opened_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  resolved_by uuid references app.account,
  reason text check(reason is null or char_length(btrim(reason)) between 3 and 800),
  check((state='open')=(resolved_at is null and resolved_by is null and reason is null))
);
create index stop_review_queue_idx on app.stop_review(state,opened_at desc,id desc);
create table app.stop_review_fund (
  review_id uuid not null references app.stop_review,
  allocation_id uuid not null references app.receipt_allocation,
  receipt_id uuid not null references app.finance_receipt,
  amount_minor bigint not null check(amount_minor>0),
  primary key(review_id,allocation_id)
);
create index stop_review_fund_receipt_idx on app.stop_review_fund(receipt_id,review_id);
alter table app.receipt_posting drop constraint receipt_posting_kind_check;
alter table app.receipt_posting add constraint receipt_posting_kind_check
  check(kind in ('record','allocate','unapply','void_receipt','refund'));
create table app.stop_cash_refund (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references app.stop_review,
  receipt_id uuid not null references app.finance_receipt,
  external_ref text not null check(char_length(btrim(external_ref)) between 1 and 160 and btrim(external_ref)=external_ref),
  external_key text generated always as (lower(regexp_replace(external_ref,'[[:space:]]+',' ','g'))) stored unique,
  refunded_date date not null,
  amount_minor bigint not null check(amount_minor>0),
  posted_by uuid not null references app.account,
  posted_at timestamptz not null default clock_timestamp()
);
create index stop_cash_refund_receipt_idx on app.stop_cash_refund(receipt_id,posted_at);
create table app.stop_charge_adjustment (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null unique references app.stop_review,
  invoice_id uuid not null unique references app.invoice,
  signed_minor bigint not null check(signed_minor<0),
  reason text not null check(char_length(btrim(reason)) between 3 and 800),
  posted_by uuid not null references app.account,
  posted_at timestamptz not null default clock_timestamp()
);
create table app.stop_disposition (
  review_id uuid not null references app.stop_review,
  receipt_id uuid not null references app.finance_receipt,
  allocation_id uuid unique references app.receipt_allocation,
  refund_id uuid unique references app.stop_cash_refund,
  amount_minor bigint not null check(amount_minor>0),
  check((allocation_id is not null)<>(refund_id is not null))
);
create index stop_disposition_review_idx on app.stop_disposition(review_id,receipt_id);
alter table app.stop_review enable row level security;
alter table app.stop_review_fund enable row level security;
alter table app.stop_cash_refund enable row level security;
alter table app.stop_charge_adjustment enable row level security;
alter table app.stop_disposition enable row level security;

create function app.enrollment_stop_staff() returns boolean
language sql stable security definer set search_path=pg_catalog
as $$
  select app.actor_persona()='admin' and (app.has_capability('students.manage')
    or app.has_inbox('student_affairs') and app.office_delegate_active('student_affairs',app.actor_account()))
$$;

create function app.enrollment_stop_visible(target uuid,operation text) returns boolean
language sql stable security definer set search_path=pg_catalog
as $$
  select exists(select 1 from app.enrollment_stop s where s.id=target and (
    (operation in ('read','withdraw') and app.actor_persona()='guardian' and s.requester_id=app.actor_account()
      and app.has_child_link(s.student_id)) or (operation in ('read','decide') and app.enrollment_stop_staff())
  ))
$$;

create function app.guard_enrollment_stop_insert() returns trigger
language plpgsql security definer set search_path=pg_catalog
as $$
begin
  if new.voided_at is null and exists(
    select 1 from app.enrollment_stop s where s.student_id=new.student_id and s.state='approved'
      and daterange(s.start_month,s.end_month,'[)') && daterange(new.effective_from,new.effective_until,'[)')
  ) then raise exception 'Placement overlaps approved attendance stop' using errcode='23P01'; end if;
  return new;
end
$$;
-- The existing enrollment trigger takes the calendar lock first.
create trigger stop_guard_enrollment before insert or update on app.enrollment
for each row execute function app.guard_enrollment_stop_insert();

create or replace function app.billing_stop_applies(pupil uuid,billing_month date) returns boolean
language sql stable security definer set search_path=pg_catalog
as $$
  select exists(select 1 from app.enrollment_stop s where s.student_id=pupil and s.state='approved'
    and billing_month<@daterange(s.start_month,s.end_month,'[)'))
$$;

create function app.finance_reminder_held(target uuid) returns boolean
language sql stable set search_path=pg_catalog
as $$
  select exists(select 1 from app.invoice j join app.enrollment_stop s on s.student_id=j.student_id
    and j.period<@daterange(s.start_month,s.end_month,'[)')
    left join app.stop_review r on r.invoice_id=j.id
    where j.id=target and (s.state='pending' or s.state='approved' and (j.kind='monthly' or r.state is distinct from 'retained')))
$$;

create function app.create_enrollment_stop(pupil uuid,last_attended date,term text,explanation text)
returns uuid language plpgsql volatile security definer set search_path=pg_catalog
as $$
declare begins date:=(last_attended+interval '1 month')::date;
declare ends date;
declare stored uuid;
begin
  if app.actor_persona()<>'guardian' then raise exception 'Enrollment stop unavailable' using errcode='42501'; end if;
  perform app.lock_school_calendar();
  if not app.has_child_link(pupil) then raise exception 'Enrollment stop unavailable' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('madrasty:billing:'||pupil::text,0));
  if begins<=app.billing_school_month() or extract(day from last_attended)<>1 or not exists (
    select 1 from app.enrollment e join app.school_year y on y.id=e.year_id and y.state='active'
    join app.student s on s.id=e.student_id and s.state='active'
    where e.student_id=pupil and e.voided_at is null and e.effective_from<begins and e.effective_until>last_attended
  ) then raise exception 'Invalid last enrolled month' using errcode='23514'; end if;
  if term='one_month' then ends:=(begins+interval '1 month')::date; end if;
  insert into app.enrollment_stop as s(student_id,requester_id,last_month,start_month,end_month,duration,reason)
    values(pupil,app.actor_account(),last_attended,begins,ends,term,explanation) returning s.id into stored;
  return stored;
end
$$;

create function app.apply_approved_stop_enrollment(request app.enrollment_stop) returns void
language plpgsql volatile set search_path=pg_catalog
as $$
declare e app.enrollment%rowtype;
begin
  for e in select current.* from app.enrollment current join app.school_year y on y.id=current.year_id and y.state<>'closed'
    where current.student_id=request.student_id and current.voided_at is null
      and daterange(current.effective_from,current.effective_until,'[)') && daterange(request.start_month,request.end_month,'[)')
    order by current.class_id,current.effective_from,current.id for update of current
  loop
    if e.effective_from<request.start_month then
      update app.enrollment x set effective_until=request.start_month,revision=x.revision+1,ending_reason='fee_stop'
        where x.id=e.id;
    else
      update app.enrollment x set voided_at=clock_timestamp(),revision=x.revision+1,ending_reason='fee_stop' where x.id=e.id;
    end if;
    if request.end_month is not null and e.effective_until>request.end_month then
      insert into app.enrollment(student_id,class_id,year_id,effective_from,effective_until,ending_reason)
        values(e.student_id,e.class_id,e.year_id,request.end_month,e.effective_until,e.ending_reason);
    end if;
  end loop;
end
$$;

create function app.apply_approved_stop_charges(request app.enrollment_stop) returns jsonb
language plpgsql volatile set search_path=pg_catalog
as $$
declare j app.invoice%rowtype;
declare old_paid bigint;
declare review_id uuid;
declare result jsonb:='[]'::jsonb;
begin
  for j in select current.* from app.invoice current where current.student_id=request.student_id
      and current.period<@daterange(request.start_month,request.end_month,'[)') and current.cancelled_at is null
      and not exists(select 1 from app.stop_review z where z.invoice_id=current.id)
    order by current.id for update
  loop
    old_paid:=app.invoice_allocated_minor(j.id);
    if j.kind='monthly' and old_paid=0 then
      update app.invoice x set cancelled_at=clock_timestamp(),revision=x.revision+1 where x.id=j.id;
      result:=result||jsonb_build_array(jsonb_build_object('invoiceId',j.id,'effect','cancelled','reviewId',null));
    else
      insert into app.stop_review as r(stop_id,invoice_id,original_allocated_minor)
        values(request.id,j.id,old_paid) returning r.id into review_id;
      insert into app.stop_review_fund(review_id,allocation_id,receipt_id,amount_minor)
        select review_id,a.id,a.receipt_id,a.amount_minor from app.receipt_allocation a
        where a.invoice_id=j.id and not exists(select 1 from app.receipt_reversal x where x.allocation_id=a.id);
      update app.invoice x set revision=x.revision+1 where x.id=j.id;
      result:=result||jsonb_build_array(jsonb_build_object('invoiceId',j.id,'effect','review','reviewId',review_id));
    end if;
  end loop;
  return result;
end
$$;

create function app.change_enrollment_stop(target uuid,expected integer,operation text,explanation text)
returns table(state text,revision integer,effects jsonb)
language plpgsql volatile security definer set search_path=pg_catalog
as $$
declare request app.enrollment_stop%rowtype;
declare result jsonb:='[]'::jsonb;
begin
  if operation not in ('withdraw','approve','reject') or not app.enrollment_stop_visible(target,
    case when operation='withdraw' then 'withdraw' else 'decide' end) then
    raise exception 'Enrollment stop unavailable' using errcode='42501'; end if;
  perform app.lock_school_calendar();
  select s.* into request from app.enrollment_stop s where s.id=target for update;
  if not app.enrollment_stop_visible(target,case when operation='withdraw' then 'withdraw' else 'decide' end) then
    raise exception 'Enrollment stop unavailable' using errcode='42501';
  end if;
  if request.state<>'pending' or request.revision<>expected then return; end if;
  if operation='approve' and request.start_month<=app.billing_school_month() then
    raise exception 'Stop start is no longer future' using errcode='23514';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('madrasty:billing:'||request.student_id::text,0));
  update app.enrollment_stop s set state=case operation when 'withdraw' then 'withdrawn' when 'approve' then 'approved' else 'rejected' end,
    decision_note=case when operation<>'withdraw' then explanation end,
    revision=s.revision+1,resolved_at=clock_timestamp(),resolved_by=app.actor_account()
    where s.id=target returning s.* into request;
  if request.state='approved' then
    perform app.apply_approved_stop_enrollment(request);
    result:=app.apply_approved_stop_charges(request);
  end if;
  return query select request.state,request.revision,result;
end
$$;


create function app.enrollment_stop_options()
returns table(school_month date,may_decide boolean)
language sql stable security definer set search_path=pg_catalog
as $$ select app.billing_school_month(),app.enrollment_stop_staff()
  where app.actor_persona()='guardian' or app.enrollment_stop_staff() $$;

create function app.enrollment_stop_rows(target uuid,pupil uuid,state_key text)
returns table(id uuid,student_id uuid,student_name text,student_number text,requester_id uuid,
  last_month date,start_month date,end_month date,duration text,state text,reason text,note text,
  revision integer,created_at timestamptz,resolved_at timestamptz,can_decide boolean,can_withdraw boolean)
language sql stable security definer set search_path=pg_catalog
as $$
  select s.id,s.student_id,p.display_name,p.student_number,s.requester_id,s.last_month,s.start_month,s.end_month,s.duration,s.state,
    s.reason,s.decision_note,s.revision,s.created_at,s.resolved_at,s.state='pending' and app.enrollment_stop_staff(),
    s.state='pending' and app.actor_persona()='guardian' and s.requester_id=app.actor_account()
  from app.enrollment_stop s join app.student p on p.id=s.student_id
  where (target is null or s.id=target) and (pupil is null or s.student_id=pupil) and (state_key is null or s.state=state_key)
    and (app.enrollment_stop_staff() or (app.actor_persona()='guardian' and s.requester_id=app.actor_account() and app.has_child_link(s.student_id)))
$$;

create or replace function app.finance_refunded_minor(target uuid,cutoff timestamptz) returns bigint
language sql stable set search_path=pg_catalog
as $$
  select coalesce(sum(r.amount_minor),0)::bigint from app.stop_cash_refund r where r.receipt_id=target and r.posted_at<cutoff
$$;

create or replace function app.invoice_collectible_minor(target uuid,cutoff timestamptz) returns bigint
language sql stable set search_path=pg_catalog
as $$
  select case when j.cancelled_at<cutoff then 0::bigint else greatest(0,j.total_minor+coalesce(
    (select sum(a.signed_minor)::bigint from app.stop_charge_adjustment a where a.invoice_id=j.id and a.posted_at<cutoff),0)) end
  from app.invoice j where j.id=target and j.issued_at<cutoff
$$;

create function app.invoice_accepts_allocations(target uuid) returns boolean
language sql stable set search_path=pg_catalog
as $$ select not exists(select 1 from app.stop_review r where r.invoice_id=target and r.state='open') $$;

create function app.stop_review_can_post(target uuid) returns boolean
language sql stable security definer set search_path=pg_catalog
as $$ select app.has_capability('finance.post') and exists(select 1 from app.stop_review r where r.id=target) $$;

create function app.stop_review_evidence(target uuid)
returns table(id uuid,receipt_id uuid,kind text,amount_minor bigint,reference text)
language sql stable set search_path=pg_catalog
as $$
  with reviewed as (
    select r.*,j.payer_account_id from app.stop_review r join app.invoice j on j.id=r.invoice_id where r.id=target
  )
  select f.id,f.receipt_id,'refund',f.amount_minor,f.external_ref from app.stop_cash_refund f where f.review_id=target
  union all
  select a.id,a.receipt_id,'reallocation',a.amount_minor,j.invoice_number
  from reviewed r join app.receipt_allocation a on a.invoice_id<>r.invoice_id
  join app.invoice j on j.id=a.invoice_id and j.payer_account_id=r.payer_account_id
  join app.receipt_posting p on p.id=a.posting_id and p.posted_at>=r.opened_at
  where exists(select 1 from app.stop_review_fund f where f.review_id=target and f.receipt_id=a.receipt_id)
    and not exists(select 1 from app.receipt_reversal x where x.allocation_id=a.id)
    and not exists(select 1 from app.stop_disposition x where x.allocation_id=a.id and x.review_id<>target)
$$;

create function app.stop_review_rows(target uuid,state_key text,include_details boolean)
returns table(id uuid,stop_id uuid,student_id uuid,student_name text,student_number text,invoice_id uuid,
  invoice_number text,period date,kind text,currency text,original_minor bigint,collectible_minor bigint,
  original_allocated_minor bigint,current_allocated_minor bigint,state text,revision integer,opened_at timestamptz,
  resolved_at timestamptz,reason text,can_post boolean,funds jsonb,evidence jsonb,adjustment_id uuid)
language sql stable security definer set search_path=pg_catalog
as $$
  select r.id,r.stop_id,j.student_id,j.student_name,j.student_number,j.id,j.invoice_number,j.period,j.kind,j.currency::text,
    j.total_minor,app.invoice_collectible_minor(j.id,'infinity'::timestamptz),r.original_allocated_minor,app.invoice_allocated_minor(j.id),
    r.state,r.revision,r.opened_at,r.resolved_at,case when include_details then r.reason end,r.state='open' and app.has_capability('finance.post'),
    case when include_details then coalesce((
      select jsonb_agg(jsonb_build_object('receiptId',f.receipt_id,'receiptNumber',money.receipt_number,'sourceMinor',f.original,
        'activeMinor',f.active,'refundedMinor',coalesce((select sum(refund.amount_minor) from app.stop_cash_refund refund
          where refund.review_id=r.id and refund.receipt_id=f.receipt_id),0),'unmatchedMinor',
        greatest(0,m.remainder_minor-app.finance_refunded_minor(f.receipt_id,'infinity'::timestamptz))) order by money.receipt_number)
      from (select a.receipt_id,sum(a.amount_minor) as original,
        coalesce(sum(a.amount_minor) filter(where x.allocation_id is null),0) as active
        from app.stop_review_fund a left join app.receipt_reversal x on x.allocation_id=a.allocation_id
        where a.review_id=r.id group by a.receipt_id) f
      join app.finance_receipt money on money.id=f.receipt_id
      cross join lateral app.receipt_money(f.receipt_id,'infinity'::timestamptz) m
    ),'[]'::jsonb) end,
    case when include_details then coalesce((
      select jsonb_agg(jsonb_build_object('id',e.id,'receiptId',e.receipt_id,'kind',e.kind,'amountMinor',e.amount_minor,
        'reference',e.reference,'recorded',exists(select 1 from app.stop_disposition d where d.review_id=r.id
          and (d.allocation_id=e.id or d.refund_id=e.id))) order by e.kind,e.id)
      from app.stop_review_evidence(r.id) e
      where r.state='open' or exists(select 1 from app.stop_disposition d where d.review_id=r.id
        and (d.allocation_id=e.id or d.refund_id=e.id))
    ),'[]'::jsonb) end,
    (select a.id from app.stop_charge_adjustment a where a.review_id=r.id)
  from app.stop_review r join app.invoice j on j.id=r.invoice_id
  where app.finance_receipt_staff() and (target is null or r.id=target) and (state_key is null or r.state=state_key)
$$;

create function app.record_stop_refund(target uuid,expected integer,receipt_key uuid,external_key text,returned_date date,amount bigint,verified boolean)
returns table(refund_id uuid,revision integer)
language plpgsql volatile security definer set search_path=pg_catalog
as $$
declare review app.stop_review%rowtype;
declare receipt app.finance_receipt%rowtype;
declare available bigint;
declare returned bigint;
declare freed bigint;
declare refund uuid;
declare receipt_revision integer;
begin
  if not app.stop_review_can_post(target) then raise exception 'Finance review unavailable' using errcode='42501'; end if;
  perform app.lock_school_calendar();
  select r.* into review from app.stop_review r where r.id=target for update;
  if review.revision<>expected or review.state<>'open' then return; end if;
  select r.* into receipt from app.finance_receipt r where r.id=receipt_key for update;
  if not found then raise exception 'Receipt unavailable' using errcode='42501'; end if;
  perform app.lock_receipt_invoices(array[review.invoice_id]);
  select m.remainder_minor-app.finance_refunded_minor(receipt_key,'infinity'::timestamptz),m.revision into available,receipt_revision
    from app.receipt_money(receipt_key,'infinity'::timestamptz) m;
  select coalesce(sum(f.amount_minor),0)::bigint into freed from app.stop_review_fund f
    join app.receipt_reversal x on x.allocation_id=f.allocation_id
    where f.review_id=target and f.receipt_id=receipt_key;
  select coalesce(sum(r.amount_minor),0)::bigint into returned from app.stop_cash_refund r where r.review_id=target and r.receipt_id=receipt_key;
  if not coalesce(verified,false) or returned_date<receipt.received_date or returned_date>app.school_today()
    or amount not between 1 and least(available,freed-returned) then
    raise exception 'Refund exceeds verified freed funds' using errcode='23514';
  end if;
  insert into app.stop_cash_refund as r(review_id,receipt_id,external_ref,refunded_date,amount_minor,posted_by)
    values(target,receipt_key,external_key,returned_date,amount,app.actor_account()) returning r.id into refund;
  insert into app.receipt_posting(receipt_id,revision,kind,reason,actor_id,posted_at)
    values(receipt_key,receipt_revision+1,'refund','external_refund_verified',app.actor_account(),clock_timestamp());
  update app.stop_review r set revision=r.revision+1 where r.id=target returning r.* into review;
  return query select refund,review.revision;
end
$$;

create function app.resolve_stop_review(target uuid,expected integer,decision text,refs uuid[],explanation text)
returns table(state text,revision integer,adjustment_id uuid) language plpgsql volatile security definer set search_path=pg_catalog
as $$
declare review app.stop_review%rowtype;
declare invoice app.invoice%rowtype;
declare evidence_count integer;
declare adjustment uuid;
begin
  if not app.stop_review_can_post(target) then raise exception 'Finance review unavailable' using errcode='42501'; end if;
  perform app.lock_school_calendar();
  select r.* into review from app.stop_review r where r.id=target for update;
  if review.revision<>expected or review.state<>'open' then return; end if;
  perform 1 from app.finance_receipt r where exists(select 1 from app.stop_review_fund f where f.review_id=target and f.receipt_id=r.id)
    order by r.id for update;
  perform app.lock_receipt_invoices(array[review.invoice_id]);
  select j.* into invoice from app.invoice j where j.id=review.invoice_id;

  if decision='retain_manual' then
    if invoice.kind<>'manual' or cardinality(refs)<>0
      or app.invoice_allocated_minor(invoice.id)<>review.original_allocated_minor
      or exists(select 1 from app.stop_cash_refund f where f.review_id=target) then
      raise exception 'Retaining this charge would discard reconciliation evidence' using errcode='23514';
    end if;
  elsif decision='waive' then
    if app.invoice_allocated_minor(invoice.id)<>0 then
      raise exception 'Review has active original allocations' using errcode='23514';
    end if;
    select count(*) into evidence_count from app.stop_review_evidence(target) e where e.id=any(refs);
    if evidence_count<>cardinality(refs) or exists(
      select 1 from app.stop_cash_refund r where r.review_id=target and not r.id=any(refs)
    ) or exists(
      select 1 from (
        select f.receipt_id,sum(f.amount_minor) as amount from app.stop_review_fund f where f.review_id=target group by f.receipt_id
      ) received left join (
        select e.receipt_id,sum(e.amount_minor) as amount from app.stop_review_evidence(target) e where e.id=any(refs) group by e.receipt_id
      ) documented using(receipt_id)
      where received.amount<>coalesce(documented.amount,0)
    ) then raise exception 'Review funds have no confirmed disposition' using errcode='23514'; end if;

    insert into app.stop_disposition(review_id,receipt_id,allocation_id,refund_id,amount_minor)
    select target,e.receipt_id,case when e.kind='reallocation' then e.id end,case when e.kind='refund' then e.id end,e.amount_minor
    from app.stop_review_evidence(target) e where e.id=any(refs);
    insert into app.stop_charge_adjustment as a(review_id,invoice_id,signed_minor,reason,posted_by)
    values(target,invoice.id,-app.invoice_collectible_minor(invoice.id,'infinity'::timestamptz),explanation,app.actor_account())
    returning a.id into adjustment;
  else raise exception 'Invalid review resolution' using errcode='23514';
  end if;

  update app.invoice j set revision=j.revision+1 where j.id=invoice.id;
  update app.stop_review r set state=case decision when 'waive' then 'waived' else 'retained' end,
    reason=explanation,resolved_at=clock_timestamp(),resolved_by=app.actor_account(),revision=r.revision+1
  where r.id=target returning r.* into review;
  return query select review.state,review.revision,adjustment;
end
$$;

create function app.protect_recorded_refund_and_disposition() returns trigger
language plpgsql security definer set search_path=pg_catalog
as $$
begin
  if tg_table_name='receipt_posting' then
    if new.kind='void_receipt' and app.finance_refunded_minor(new.receipt_id,'infinity'::timestamptz)>0 then
      raise exception 'Receipt has a verified outward refund' using errcode='23514';
    end if;
  elsif exists(select 1 from app.stop_disposition d where d.allocation_id=new.allocation_id) then
    raise exception 'Allocation settles a closed finance review' using errcode='23514';
  end if;
  return new;
end
$$;
create trigger protect_refunded_receipt before insert on app.receipt_posting
for each row execute function app.protect_recorded_refund_and_disposition();
create trigger protect_review_disposition before insert on app.receipt_reversal
for each row execute function app.protect_recorded_refund_and_disposition();

insert into app.audit_action_rule(action,resource_kind,change_category,allowed_capabilities,link_kind)
values ('enrollment.stop_requested','student','creation',array['students.manage'],null),
  ('enrollment.stop_withdrawn','student','update',array['students.manage'],null),
  ('enrollment.stop_rejected','student','update',array['students.manage'],null),
  ('enrollment.stop_approved','student','update',array['students.manage'],null),
  ('finance.stop_charge_cancelled','finance','update',array['finance.read','finance.post'],null),
  ('finance.stop_review_opened','finance','creation',array['finance.read','finance.post'],null),
  ('finance.stop_refund_recorded','finance','creation',array['finance.read','finance.post'],null),
  ('finance.stop_review_resolved','finance','update',array['finance.read','finance.post'],null);

revoke all on function app.enrollment_stop_staff(),app.enrollment_stop_visible(uuid,text),app.guard_enrollment_stop_insert(),
  app.finance_reminder_held(uuid),app.create_enrollment_stop(uuid,date,text,text),app.apply_approved_stop_enrollment(app.enrollment_stop),
  app.apply_approved_stop_charges(app.enrollment_stop),app.change_enrollment_stop(uuid,integer,text,text),
  app.enrollment_stop_options(),app.enrollment_stop_rows(uuid,uuid,text),app.invoice_accepts_allocations(uuid),
  app.stop_review_can_post(uuid),app.stop_review_evidence(uuid),app.stop_review_rows(uuid,text,boolean),
  app.record_stop_refund(uuid,integer,uuid,text,date,bigint,boolean),app.resolve_stop_review(uuid,integer,text,uuid[],text),
  app.protect_recorded_refund_and_disposition()
from public,anon,authenticated,service_role;
grant execute on function app.enrollment_stop_staff(),app.enrollment_stop_visible(uuid,text),app.create_enrollment_stop(uuid,date,text,text),
  app.change_enrollment_stop(uuid,integer,text,text),app.enrollment_stop_options(),app.enrollment_stop_rows(uuid,uuid,text),
  app.stop_review_can_post(uuid),app.stop_review_rows(uuid,text,boolean),app.record_stop_refund(uuid,integer,uuid,text,date,bigint,boolean),
  app.resolve_stop_review(uuid,integer,text,uuid[],text)
to app_runtime;


-- Reuse the current ledger and report projections with verified stop effects.
create or replace function app.record_finance_receipt(external_ref text,channel text,received date,currency_code text,amount bigint,
  invoice_key uuid,verified boolean)
returns table(receipt_id uuid,receipt_number text,remainder_minor bigint,revision integer,posting jsonb)
language plpgsql volatile security definer set search_path=pg_catalog
as $$
declare r app.finance_receipt%rowtype;
declare j app.invoice%rowtype;
declare options record;
declare posting_id uuid;
declare timestamp_key timestamptz;
begin
  if not app.has_capability('finance.post') then raise exception 'Receipt posting unavailable' using errcode='42501'; end if;
  perform app.lock_school_calendar();
  select * into options from app.finance_receipt_options();
  if not found or received>options.school_date or received<'1900-01-01'::date
    or currency_code<>options.currency or not coalesce(verified,false) or (channel='cash' and not options.cash_enabled) then
    raise exception 'Invalid verified collection' using errcode='23514';
  end if;
  if invoice_key is not null then
    perform app.lock_receipt_invoices(array[invoice_key]);
    select i.* into j from app.invoice i where i.id=invoice_key;
    if not found then raise exception 'Invoice unavailable' using errcode='42501'; end if;
  end if;
  timestamp_key:=clock_timestamp();
  insert into app.finance_receipt as stored(receipt_number,external_ref,method,received_date,currency,amount_minor,suggested_invoice_id,recorded_by,recorded_at)
    values('MA-E-'||nextval('app.receipt_number_seq'::regclass),external_ref,channel,received,currency_code,amount,invoice_key,
      app.actor_account(),timestamp_key) returning stored.* into r;
  insert into app.receipt_posting as p(receipt_id,kind,revision,actor_id,posted_at)
    values(r.id,'record',1,app.actor_account(),timestamp_key) returning p.id into posting_id;
  if j.id is not null and j.currency=r.currency and j.cancelled_at is null and app.invoice_accepts_allocations(j.id)
    and app.invoice_collectible_minor(j.id,'infinity'::timestamptz)-app.invoice_allocated_minor(j.id)=amount then
    perform app.receipt_add_allocation(r.id,posting_id,j.id,amount);
  end if;
  return query select r.id,r.receipt_number,m.remainder_minor,m.revision,app.receipt_posting_event(posting_id)
    from app.receipt_money(r.id,'infinity'::timestamptz) m;
end
$$;

create or replace function app.allocate_finance_receipt(target uuid,expected integer,lines jsonb)
returns table(receipt_id uuid,receipt_number text,remainder_minor bigint,revision integer,posting jsonb)
language plpgsql volatile security definer set search_path=pg_catalog
as $$
declare r app.finance_receipt%rowtype;
declare m record;
declare entry record;
declare posting_id uuid;
declare targets uuid[];
declare total_amount numeric;
begin
  if not app.has_capability('finance.post') then raise exception 'Receipt posting unavailable' using errcode='42501'; end if;
  perform app.lock_school_calendar();
  select stored.* into r from app.finance_receipt stored where stored.id=target for update;
  if not found then raise exception 'Receipt unavailable' using errcode='42501'; end if;
  select * into m from app.receipt_money(target,'infinity'::timestamptz);
  if m.revision<>expected then return; end if;
  select array_agg(distinct i."invoiceId"),sum(i."amountMinor") into targets,total_amount
    from jsonb_to_recordset(lines) i("invoiceId" uuid,"amountMinor" bigint,"invoiceRevision" integer);
  if m.voided or coalesce(cardinality(targets),0) not between 1 and 100 or cardinality(targets)<>jsonb_array_length(lines)
    or total_amount>m.remainder_minor-app.finance_refunded_minor(target,'infinity'::timestamptz) then raise exception 'Invalid receipt allocation' using errcode='23514'; end if;

  perform app.lock_receipt_invoices(targets);
  for entry in
    select i.*,j.id,j.revision,j.cancelled_at,j.currency,
      app.invoice_collectible_minor(j.id,'infinity'::timestamptz)-app.invoice_allocated_minor(j.id) as balance
    from jsonb_to_recordset(lines) i("invoiceId" uuid,"amountMinor" bigint,"invoiceRevision" integer)
    left join app.invoice j on j.id=i."invoiceId" order by i."invoiceId"
  loop
    if entry.id is null then raise exception 'Invoice unavailable' using errcode='42501'; end if;
    if entry.revision<>entry."invoiceRevision" then return; end if;
    if entry.cancelled_at is not null or entry.currency<>r.currency or not app.invoice_accepts_allocations(entry.id) or
      entry."amountMinor" not between 1 and entry.balance or entry."amountMinor" is null then
      raise exception 'Invoice balance or currency unavailable' using errcode='23514';
    end if;
  end loop;

  insert into app.receipt_posting as p(receipt_id,kind,revision,actor_id,posted_at)
  values(target,'allocate',expected+1,app.actor_account(),clock_timestamp()) returning p.id into posting_id;
  for entry in select i.* from jsonb_to_recordset(lines) i("invoiceId" uuid,"amountMinor" bigint) order by i."invoiceId" loop
    perform app.receipt_add_allocation(target,posting_id,entry."invoiceId",entry."amountMinor");
  end loop;
  return query select r.id,r.receipt_number,current_money.remainder_minor-app.finance_refunded_minor(target,'infinity'::timestamptz),current_money.revision,app.receipt_posting_event(posting_id)
    from app.receipt_money(r.id,'infinity'::timestamptz) current_money;
end
$$;

create or replace function app.reverse_finance_receipt(target uuid,expected integer,operation text,selected uuid[],explanation text)
returns table(receipt_id uuid,receipt_number text,remainder_minor bigint,revision integer,posting jsonb)
language plpgsql volatile security definer set search_path=pg_catalog
as $$
declare r app.finance_receipt%rowtype;
declare m record;
declare posting_id uuid;
declare allocations uuid[];
declare invoices uuid[];
begin
  if not app.has_capability('finance.post') then raise exception 'Receipt posting unavailable' using errcode='42501'; end if;
  perform app.lock_school_calendar();
  select stored.* into r from app.finance_receipt stored where stored.id=target for update;
  if not found then raise exception 'Receipt unavailable' using errcode='42501'; end if;
  select * into m from app.receipt_money(target,'infinity'::timestamptz);
  if m.revision<>expected then return; end if;
  if m.voided or operation not in ('unapply','void_receipt') then return; end if;
  select coalesce(array_agg(a.id),array[]::uuid[]),coalesce(array_agg(distinct a.invoice_id),array[]::uuid[])
    into allocations,invoices from app.receipt_allocation a
    where a.receipt_id=target and (operation='void_receipt' or a.id=any(selected))
      and not exists(select 1 from app.receipt_reversal x where x.allocation_id=a.id);
  if operation='unapply' and (cardinality(allocations)=0 or cardinality(allocations) is distinct from cardinality(selected)) then
    raise exception 'Invalid receipt reversal selection' using errcode='23514';
  end if;
  perform app.lock_receipt_invoices(invoices);
  insert into app.receipt_posting as p(receipt_id,kind,revision,reason,actor_id,posted_at)
    values(target,operation,expected+1,explanation,app.actor_account(),clock_timestamp()) returning p.id into posting_id;
  insert into app.receipt_reversal(receipt_id,posting_id,allocation_id)
    select target,posting_id,id from unnest(allocations) as list(id);
  update app.invoice j set revision=j.revision+1 where j.id=any(invoices);
  return query select r.id,r.receipt_number,current_money.remainder_minor-app.finance_refunded_minor(target,'infinity'::timestamptz),current_money.revision,app.receipt_posting_event(posting_id)
    from app.receipt_money(r.id,'infinity'::timestamptz) current_money;
end
$$;

create or replace function app.receipt_staff_rows(target uuid,state_filter text,after_at timestamptz,after_id uuid,row_limit integer,details boolean)
returns table(id uuid,receipt_number text,method text,received_date date,currency text,amount_minor bigint,active_minor bigint,
  applied_minor bigint,remainder_minor bigint,state text,recorded_at timestamptz,revision integer,external_ref text,
  suggested_invoice_id uuid,allocations jsonb,history jsonb,can_post boolean)
language sql stable security definer set search_path=pg_catalog
as $$
  with visible as (
    select r.*,m.active_minor-f.refunded as active_minor,m.applied_minor,m.remainder_minor-f.refunded as remainder_minor,m.revision,
      case when m.voided then 'voided' when m.remainder_minor>f.refunded then 'needs_matching' else 'allocated' end as state
    from app.finance_receipt r cross join lateral app.receipt_money(r.id,'infinity'::timestamptz) m
    cross join lateral (select app.finance_refunded_minor(r.id,'infinity'::timestamptz) as refunded) f
    where app.finance_receipt_staff() and (target is null or r.id=target)
      and (after_id is null or (r.recorded_at,r.id)<(after_at,after_id))
  ), selected as (
    select r.* from visible r where state_filter is null or r.state=state_filter
    order by r.recorded_at desc,r.id desc limit greatest(1,least(row_limit,101))
  )
  select r.id,r.receipt_number,r.method,r.received_date,r.currency::text,r.amount_minor,r.active_minor,r.applied_minor,
    r.remainder_minor,r.state,r.recorded_at,r.revision,case when details then r.external_ref end,
    case when details then r.suggested_invoice_id end,
    case when details then app.receipt_allocation_details(r.id,null) end,
    case when details then coalesce((select jsonb_agg(jsonb_build_object(
      'revision',p.revision,'kind',p.kind,'reason',case when p.kind<>'refund' then p.reason end,'postedAt',
      to_char(p.posted_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) order by p.revision)
      from app.receipt_posting p where p.receipt_id=r.id),'[]'::jsonb) end,
    r.state<>'voided' and app.has_capability('finance.post')
  from selected r order by r.recorded_at desc,r.id desc
$$;

create or replace function app.invoice_rows(target uuid,period_key date,pupil uuid,state_filter text,with_details boolean)
returns table(id uuid,invoice_number text,student_id uuid,student_number text,student_name text,payer_name text,
  period date,kind text,due_date date,currency text,total_minor bigint,allocated_minor bigint,balance_minor bigint,state text,
  issued_at timestamptz,cancelled_at timestamptz,revision integer,lines jsonb,payment_instructions jsonb,issue_instructions jsonb,
  receipt_ids jsonb,can_inquire boolean)
language sql stable security definer set search_path=pg_catalog
as $$
  with visible as (
    select j.*,app.invoice_allocated_minor(j.id) as paid,app.invoice_collectible_minor(j.id,'infinity'::timestamptz) as collectible
    from app.invoice j
    where (target is null or j.id=target) and (period_key is null or j.period=period_key) and (pupil is null or j.student_id=pupil)
      and app.finance_invoice_visible(j.id)
  ), priced as (
    select j.*,greatest(0,j.collectible-j.paid) as remainder,
      case when j.collectible=0 then 'cancelled'
        when j.paid>=j.collectible then 'paid' when j.paid>0 then 'partial' else 'unpaid' end as current_state
    from visible j
  )
  select j.id,j.invoice_number,j.student_id,j.student_number,j.student_name,j.payer_name,j.period,j.kind,j.due_date,j.currency::text,
    j.total_minor,j.paid,j.remainder,j.current_state,j.issued_at,j.cancelled_at,j.revision,
    case when with_details then coalesce((
      select jsonb_agg(jsonb_build_object('titleAr',i.title_ar,'titleDe',i.title_de,'amountMinor',i.amount_minor) order by i.ordinal)
      from app.invoice_line i where i.invoice_id=j.id
    ),'[]'::jsonb) end,
    case when with_details and j.cancelled_at is null and j.remainder>0 and app.invoice_accepts_allocations(j.id) then jsonb_build_object(
      'bankVersionId',coalesce(active.id,origin.id),'beneficiary',coalesce(active.beneficiary,origin.beneficiary),
      'iban',coalesce(active.iban,origin.iban),'amountMinor',j.remainder,'currency',j.currency::text,'reference',j.transfer_reference,
      'bankChanged',coalesce(active.id,origin.id)<>origin.id
    ) end,
    case when with_details then jsonb_build_object('bankVersionId',origin.id,'beneficiary',origin.beneficiary,'iban',origin.iban,
      'amountMinor',j.total_minor,'currency',j.currency::text,'reference',j.transfer_reference,'bankChanged',false) end,
    case when with_details then app.invoice_visible_receipts(j.id) end,
    app.actor_persona()='guardian' and j.payer_account_id=app.actor_account()
      and exists(select 1 from app.inbox_grant g where g.inbox='accounts' and app.office_delegate_active('accounts',g.account_id))
  from priced j join app.collection_bank_version origin on origin.id=j.issued_bank_id
  left join app.collection_bank_setting c on c.singleton left join app.collection_bank_version active on active.id=c.bank_id
  where state_filter is null or j.current_state=state_filter
$$;

create or replace function app.finance_report_invoices(cutoff timestamptz,day_key date,month_key date,class_key uuid,pupil uuid,status_key text)
returns table(id uuid,student_id uuid,student_name text,student_number text,payer_id uuid,payer_name text,period date,
  class_id uuid,invoice_number text,due_date date,currency text,issued_at timestamptz,total_minor bigint,
  collectible_minor bigint,allocated_minor bigint,balance_minor bigint,state text,overdue boolean)
language sql stable set search_path=pg_catalog
as $$
  with priced as (
    select j.*,app.invoice_collectible_minor(j.id,cutoff) as collectible,app.invoice_net_allocated(j.id,cutoff) as paid
    from app.invoice j
    where j.issued_at<cutoff and (month_key is null or j.period=month_key)
      and (class_key is null or j.billing_class_id=class_key) and (pupil is null or j.student_id=pupil)
      and (app.finance_report_scope()='staff' or app.finance_report_scope()='payer' and j.payer_account_id=app.actor_account())
  ), balanced as (
    select j.*,greatest(0,j.collectible-j.paid) as balance,
      case when j.collectible=0 then 'cancelled'
        when j.paid>=j.collectible then 'paid' when j.paid>0 then 'partial' else 'unpaid' end as state
    from priced j
  )
  select j.id,j.student_id,j.student_name,j.student_number,j.payer_account_id,j.payer_name,j.period,j.billing_class_id,j.invoice_number,
    j.due_date,j.currency::text,j.issued_at,j.total_minor,j.collectible,j.paid,j.balance,j.state,j.balance>0 and j.due_date<day_key
  from balanced j where status_key is null or j.state=status_key or status_key='overdue' and j.balance>0 and j.due_date<day_key
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
    from invoices j join app.stop_review review on review.invoice_id=j.id
    join app.stop_cash_refund f on f.review_id=review.id and f.posted_at<cutoff
    join app.finance_receipt r on r.id=f.receipt_id
    left join app.payer_receipt own on own.receipt_id=r.id and own.payer_id=j.payer_id
    left join app.school_class class on class.id=j.class_id
    where (received_from is null or r.received_date>=received_from) and (received_through is null or r.received_date<=received_through)
  )
  select row.* from report row
  where app.finance_report_scope() is not null and (after_id is null or (row.occurred_at,row.kind,row.id)<(after_at,after_kind,after_id))
  order by row.occurred_at desc,row.kind desc,row.id desc limit greatest(1,least(row_limit,25001))
$$;
