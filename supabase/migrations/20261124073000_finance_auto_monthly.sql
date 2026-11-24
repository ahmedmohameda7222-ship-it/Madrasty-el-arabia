-- Cash-first invoicing must work without inventing an IBAN or bank account.
alter table app.invoice alter column issued_bank_id drop not null;
alter table app.invoice add column issued_automatically boolean not null default false;
create or replace function app.invoice_preview_rows(proposal jsonb)
returns jsonb language sql stable security definer set search_path=pg_catalog
as $$
  with args as (
    select ((proposal->>'period')||'-01')::date as month_key,proposal->>'kind' as charge_kind,
      (proposal->>'classId')::uuid as class_key,(proposal->>'chargeSourceId')::uuid as manual_key,
      (proposal->>'dueDate')::date as override_due,
      array(select jsonb_array_elements_text(coalesce(proposal->'studentIds','[]'::jsonb))::uuid) as pupils
  ), tariff as (
    select t.* from app.fee_tariff t,args a where t.effective_month<=a.month_key order by t.effective_month desc limit 1
  ), settings as (
    select s.currency::text as school_currency,s.due_day from app.school_settings s where s.singleton
  ), content as (
    select a.*,(select version_id from app.collection_bank_for_issue()) as bank_id,
      settings.school_currency as currency,case when a.charge_kind='monthly' then tariff.id end as tariff_id,
      case when a.charge_kind='monthly' then tariff.currency::text end as tariff_currency,
      case when a.charge_kind='monthly' then tariff.lines else proposal->'lineItems' end as lines,
      coalesce(a.override_due,
        case when (a.charge_kind='monthly' and tariff.due_day is not null) or
          (a.charge_kind='manual' and settings.due_day is not null) then
          a.month_key+(least(case when a.charge_kind='monthly' then tariff.due_day else settings.due_day end,
            extract(day from (a.month_key+interval '1 month'-interval '1 day'))::integer)-1)
        end) as due_date,
      exists(
        select 1 from app.fee_tariff t cross join lateral jsonb_array_elements(t.lines) as old(item)
        cross join lateral jsonb_array_elements(coalesce(proposal->'lineItems','[]'::jsonb)) as manual(item)
        where lower(btrim(old.item->>'titleAr'))=lower(btrim(manual.item->>'titleAr'))
          or lower(btrim(old.item->>'titleDe'))=lower(btrim(manual.item->>'titleDe'))
      ) as duplicates_tariff
    from args a left join settings on true left join tariff on true
  ), scoped_pupils as (
    select s.id,s.display_name,s.student_number,k.* from app.student s cross join content k
    where (cardinality(k.pupils)>0 and s.id=any(k.pupils)) or
      (cardinality(k.pupils)=0 and exists (
        select 1 from app.enrollment e join app.school_year y on y.id=e.year_id and y.state in ('active','closed')
        where e.student_id=s.id and e.voided_at is null and e.effective_from<k.month_key+interval '1 month'
          and e.effective_until>k.month_key and (k.class_key is null or e.class_id=k.class_key)
      ))
    order by s.id limit 1001
  ), plan as (
    select s.*,g.display_name as payer_name,g.account_id,p.id as payer_version,p.guardian_id,
      app.proposed_transfer_reference(s.id) as transfer_reference,issued.id as existing_id,
      case
        when issued.id is not null then 'existing'
        when app.billing_stop_applies(s.id,s.month_key) then 'stopped'
        when not app.billing_eligible(s.id,s.month_key,s.class_key) then 'not_enrolled'
        when p.id is null or g.id is null then 'payer_missing'
        when not g.active_account then 'payer_inactive'
        when s.bank_id is null and not coalesce((select cash_enabled from app.receipt_configuration where singleton),false) then 'bank_missing'
        when s.charge_kind='monthly' and s.tariff_id is null then 'tariff_missing'
        when s.charge_kind='monthly' and s.tariff_currency is distinct from s.currency then 'currency_mismatch'
        when s.charge_kind='manual' and s.duplicates_tariff then 'monthly_charge'
        else 'ready'
      end as outcome
    from scoped_pupils s
    left join lateral (
      select v.* from app.fee_payer_version v where v.student_id=s.id and v.effective_month<=s.month_key
      order by v.effective_month desc,v.revision desc limit 1
    ) p on true
    left join lateral (select a.* from app.billing_guardian_choices(s.id) a where a.id=p.guardian_id) g on true
    left join lateral(
      select j.id from app.invoice j where j.student_id=s.id and j.kind=s.charge_kind and
        ((j.kind='monthly' and j.period=s.month_key) or (j.kind='manual' and j.manual_source_id=s.manual_key))
    ) issued on true
  )
  select coalesce(jsonb_agg(jsonb_build_object('studentId',r.id,'studentName',r.display_name,'studentNumber',r.student_number,
    'bankVersionId',r.bank_id,'tariffId',r.tariff_id,'currency',r.currency,'lines',coalesce(r.lines,'[]'::jsonb),'dueDate',r.due_date,
    'payerId',r.guardian_id,'payerAccountId',r.account_id,'payerName',r.payer_name,'payerVersionId',r.payer_version,
    'reference',r.transfer_reference,'existingId',r.existing_id,'outcome',r.outcome)
    order by r.id),'[]'::jsonb) from plan r
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
    case when with_details and j.cancelled_at is null and j.remainder>0 and app.invoice_accepts_allocations(j.id) and coalesce(active.id,origin.id) is not null then jsonb_build_object(
      'bankVersionId',coalesce(active.id,origin.id),'beneficiary',coalesce(active.beneficiary,origin.beneficiary),
      'iban',coalesce(active.iban,origin.iban),'amountMinor',j.remainder,'currency',j.currency::text,'reference',j.transfer_reference,
      'bankChanged',coalesce(active.id,origin.id) is distinct from origin.id
    ) end,
    case when with_details and origin.id is not null then jsonb_build_object('bankVersionId',origin.id,'beneficiary',origin.beneficiary,'iban',origin.iban,
      'amountMinor',j.total_minor,'currency',j.currency::text,'reference',j.transfer_reference,'bankChanged',false) end,
    case when with_details then app.invoice_visible_receipts(j.id) end,
    app.actor_persona()='guardian' and j.payer_account_id=app.actor_account()
      and exists(select 1 from app.inbox_grant g where g.inbox='accounts' and app.office_delegate_active('accounts',g.account_id))
  from priced j left join app.collection_bank_version origin on origin.id=j.issued_bank_id
  left join app.collection_bank_setting c on c.singleton left join app.collection_bank_version active on active.id=c.bank_id
  where state_filter is null or j.current_state=state_filter
$$;

-- The first automatic period defaults to NEXT month. Existing/current-month
-- records are not retroactively generated on deployment. An authorized finance
-- administrator can opt into the current month explicitly.
create table app.automatic_billing (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default true,
  start_month date not null check(extract(day from start_month)=1),
  revision integer not null default 1 check(revision>0)
);
insert into app.automatic_billing(start_month)
values((date_trunc('month',clock_timestamp() at time zone 'Europe/Berlin')+interval '1 month')::date);
alter table app.automatic_billing enable row level security;
revoke all on app.automatic_billing from public,anon,authenticated,app_runtime;

create function app.automatic_billing_settings()
returns table(enabled boolean,start_month date,school_month date,revision integer,missing_payers bigint)
language sql stable security definer set search_path=pg_catalog
as $$
  select a.enabled,a.start_month,app.billing_school_month(),a.revision,
    (select count(*) from app.student s where app.billing_eligible(s.id,app.billing_school_month(),null)
      and not exists(select 1 from app.invoice j where j.student_id=s.id and j.period=app.billing_school_month() and j.kind='monthly')
      and not exists(select 1 from lateral (
        select v.* from app.fee_payer_version v where v.student_id=s.id and v.effective_month<=app.billing_school_month()
        order by v.effective_month desc,v.revision desc limit 1
      ) v join app.guardian_profile g on g.id=v.guardian_id
      where app.contact_account_active(g.account_id,'guardian')
        and exists(select 1 from app.child_link l where l.student_id=s.id and l.guardian_id=g.id and l.state='approved'
          and l.effective_from<=now() and (l.effective_until is null or l.effective_until>now()))))
  from app.automatic_billing a where a.singleton and app.has_capability('finance.issue')
$$;
create function app.set_automatic_billing(active boolean,starts date,expected integer)
returns integer language plpgsql volatile security definer set search_path=pg_catalog
as $$
declare rev integer;
begin
  if not app.has_capability('finance.issue') then raise exception 'Automatic billing unavailable' using errcode='42501'; end if;
  perform app.lock_school_calendar();
  if active is null or starts is null or starts<app.billing_school_month() or extract(day from starts)<>1 then
    raise exception 'Invalid start month' using errcode='23514';
  end if;
  update app.automatic_billing a set enabled=active,start_month=starts,revision=a.revision+1 where a.singleton and a.revision=expected returning a.revision into rev;
  return rev;
end
$$;

-- Only the already authenticated internal delivery-worker role may run this
-- job. It can issue current-month monthly fees only, in bounded batches.
-- No user session is fabricated and no unrestricted actor is created.
create function app.issue_automatic_monthly_fees(batch_limit integer default 30)
returns integer language plpgsql volatile security definer set search_path=pg_catalog
as $$
declare period_key date;
declare tariff app.fee_tariff%rowtype;
declare cfg app.automatic_billing%rowtype;
declare school_currency text;
declare bank_key uuid;
declare entry record;
declare due_date date;
declare total bigint;
declare stored uuid;
declare ref text;
declare number_key text;
declare issued integer:=0;
declare now_key timestamptz;
begin
  perform app.lock_school_calendar();
  period_key:=app.billing_school_month();
  select a.* into cfg from app.automatic_billing a where a.singleton for share;
  if period_key is null or not cfg.enabled or period_key<cfg.start_month then return 0; end if;
  select s.currency::text into school_currency from app.school_settings s where s.singleton for share;
  select t.* into tariff from app.fee_tariff t where t.effective_month<=period_key order by t.effective_month desc limit 1;
  if not found or tariff.currency::text is distinct from school_currency then return 0; end if;
  select c.bank_id into bank_key from app.collection_bank_setting c where c.singleton for share;
  if bank_key is null and not coalesce((select cash_enabled from app.receipt_configuration where singleton),false) then return 0; end if;
  select sum((x.item->>'amountMinor')::bigint) into total from jsonb_array_elements(tariff.lines) x(item);
  due_date:=period_key+(least(tariff.due_day,extract(day from period_key+interval '1 month'-interval '1 day')::integer)-1);
  for entry in
    select s.id,s.student_number,s.display_name,v.id as payer_version,g.id as guardian_id,g.account_id,g.display_name as payer_name
    from app.student s
    join lateral (select p.* from app.fee_payer_version p where p.student_id=s.id and p.effective_month<=period_key
      order by p.effective_month desc,p.revision desc limit 1) v on true
    join app.guardian_profile g on g.id=v.guardian_id
    where app.billing_eligible(s.id,period_key,null)
      and not exists(select 1 from app.invoice j where j.student_id=s.id and j.period=period_key and j.kind='monthly')
      and app.contact_account_active(g.account_id,'guardian')
      and exists(select 1 from app.child_link l where l.student_id=s.id and l.guardian_id=g.id and l.state='approved'
        and l.effective_from<=now() and (l.effective_until is null or l.effective_until>now()))
    order by s.id limit greatest(1,least(coalesce(batch_limit,30),50))
  loop
    perform pg_advisory_xact_lock(hashtextextended('madrasty:billing:'||entry.id::text,0));
    perform 1 from app.child_link l where l.student_id=entry.id and l.guardian_id=entry.guardian_id and l.state='approved'
      and l.effective_from<=now() and (l.effective_until is null or l.effective_until>now()) for share;
    if not found or not app.contact_account_active(entry.account_id,'guardian') or not app.billing_eligible(entry.id,period_key,null)
      or exists(select 1 from app.invoice j where j.student_id=entry.id and j.period=period_key and j.kind='monthly') then continue; end if;
    insert into app.student_transfer_reference(student_id,reference)
      values(entry.id,app.format_student_transfer_reference(entry.display_name,entry.student_number))
      on conflict(student_id) do nothing;
    select r.reference into ref from app.student_transfer_reference r where r.student_id=entry.id;
    number_key:='MA-R-'||to_char(period_key,'YYYYMM')||'-'||nextval('app.invoice_number_seq'::regclass)::text;
    now_key:=clock_timestamp();
    insert into app.invoice as j(invoice_number,student_id,student_number,student_name,guardian_id,payer_account_id,payer_name,period,
      kind,due_date,currency,total_minor,tariff_id,payer_version_id,issued_bank_id,transfer_reference,issued_by,issued_at,issued_automatically)
    values(number_key,entry.id,entry.student_number,entry.display_name,entry.guardian_id,entry.account_id,entry.payer_name,period_key,
      'monthly',due_date,school_currency,total,tariff.id,entry.payer_version,bank_key,ref,tariff.created_by,now_key,true)
    returning j.id into stored;
    insert into app.invoice_line(invoice_id,student_id,source_key,ordinal,title_ar,title_de,amount_minor)
    select stored,entry.id,'monthly:'||to_char(period_key,'YYYY-MM')||':'||x.position,x.position,
      x.item->>'titleAr',x.item->>'titleDe',(x.item->>'amountMinor')::bigint
    from jsonb_array_elements(tariff.lines) with ordinality x(item,position);
    insert into app.outbox_event(id,type,occurred_at,actor_id,aggregate_id,payload)
      values(gen_random_uuid(),'invoice.issued',now_key,tariff.created_by,stored,
        jsonb_build_object('invoiceId',stored,'studentId',entry.id,'payerId',entry.account_id,'period',to_char(period_key,'YYYY-MM'),'dueDate',due_date::text,'revision',1));
    insert into app.audit_entry(actor_id,persona,request_id,action,aggregate_id,metadata)
      values(tariff.created_by,'admin',gen_random_uuid(),'finance.invoice_auto_issued',stored,
        jsonb_build_object('automatic',true,'tariffId',tariff.id,'period',to_char(period_key,'YYYY-MM')));
    issued:=issued+1;
  end loop;
  return issued;
end
$$;
revoke all on function app.automatic_billing_settings(),app.set_automatic_billing(boolean,date,integer),app.issue_automatic_monthly_fees(integer) from public,anon,authenticated,service_role,app_runtime;
grant execute on function app.automatic_billing_settings(),app.set_automatic_billing(boolean,date,integer) to app_runtime;
grant execute on function app.issue_automatic_monthly_fees(integer) to app_delivery_worker;
