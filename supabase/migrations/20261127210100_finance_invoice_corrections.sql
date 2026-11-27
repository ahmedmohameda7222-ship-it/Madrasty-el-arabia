-- Explicit cancellation and replacement, separate from participation-pause cancellation.
-- Historical documents are retained. The ordinary billing job still sees all historical invoices.
create table app.invoice_cancellation (
  invoice_id uuid primary key references app.invoice,
  reason text not null check(char_length(btrim(reason)) between 3 and 500),
  actor_id uuid not null references app.account,
  cancelled_at timestamptz not null,
  replacement_id uuid unique references app.invoice
);
alter table app.invoice_cancellation enable row level security;
revoke all on app.invoice_cancellation from public,anon,authenticated,service_role,app_runtime;

drop index app.one_monthly_invoice_per_child;
create unique index one_monthly_invoice_per_child on app.invoice(student_id,period) where kind='monthly' and cancelled_at is null;
drop index app.one_manual_invoice_per_source;
create unique index one_manual_invoice_per_source on app.invoice(student_id,manual_source_id) where kind='manual' and cancelled_at is null;

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
      order by (j.cancelled_at is null) desc,j.issued_at desc,j.id limit 1
    ) issued on true
  )
  select coalesce(jsonb_agg(jsonb_build_object('studentId',r.id,'studentName',r.display_name,'studentNumber',r.student_number,
    'bankVersionId',r.bank_id,'tariffId',r.tariff_id,'currency',r.currency,'lines',coalesce(r.lines,'[]'::jsonb),'dueDate',r.due_date,
    'payerId',r.guardian_id,'payerAccountId',r.account_id,'payerName',r.payer_name,'payerVersionId',r.payer_version,
    'reference',r.transfer_reference,'existingId',r.existing_id,'outcome',r.outcome)
    order by r.id),'[]'::jsonb) from plan r
$$;

create function app.invoice_correction_options(target uuid)
returns table(can_cancel boolean,can_reissue boolean,replacement_id uuid,cancellation_reason text)
language sql stable security definer set search_path=pg_catalog
as $$
  select j.cancelled_at is null and app.invoice_allocated_minor(j.id)=0
      and not exists(select 1 from app.stop_review r where r.invoice_id=j.id),
    c.invoice_id is not null and c.replacement_id is null
      and not app.billing_stop_applies(j.student_id,j.period)
      and app.billing_eligible(j.student_id,j.period,null),
    c.replacement_id,c.reason
  from app.invoice j left join app.invoice_cancellation c on c.invoice_id=j.id
  where j.id=target and app.has_capability('finance.issue') and app.finance_invoice_visible(j.id)
$$;

create function app.correct_invoice(target uuid,expected integer,operation text,explanation text)
returns table(id uuid,student_id uuid,payer_id uuid,period text,due_date text,revision integer)
language plpgsql volatile security definer set search_path=pg_catalog
as $$
declare original app.invoice%rowtype;
declare corrected app.invoice%rowtype;
declare cancellation app.invoice_cancellation%rowtype;
declare payer_version app.fee_payer_version%rowtype;
declare payer record;
declare school_currency text;
declare bank_key uuid;
declare reference_key text;
declare at_time timestamptz;
begin
  if not app.has_capability('finance.issue') or not app.finance_invoice_visible(target) then
    raise exception 'Invoice correction unavailable' using errcode='42501';
  end if;
  perform app.lock_school_calendar();
  select j.* into original from app.invoice j where j.id=target for update;
  if not found or original.revision<>expected then return; end if;
  perform pg_advisory_xact_lock(hashtextextended('madrasty:billing:'||original.student_id::text,0));
  if operation='cancel' then
    if original.cancelled_at is not null then return; end if;
    if app.invoice_allocated_minor(target)<>0 or exists(select 1 from app.stop_review r where r.invoice_id=target)
      or explanation is null or char_length(btrim(explanation)) not between 3 and 500 then
      raise exception 'Resolve existing allocations or fee review before cancellation' using errcode='23514';
    end if;
    at_time:=clock_timestamp();
    update app.invoice j set cancelled_at=at_time,revision=j.revision+1 where j.id=target returning j.* into corrected;
    insert into app.invoice_cancellation(invoice_id,reason,actor_id,cancelled_at) values(target,btrim(explanation),app.actor_account(),at_time);
  elsif operation='reissue' then
    select c.* into cancellation from app.invoice_cancellation c where c.invoice_id=target for update;
    if not found or cancellation.replacement_id is not null or original.cancelled_at is null then return; end if;
    if not app.billing_eligible(original.student_id,original.period,null) or app.billing_stop_applies(original.student_id,original.period) then
      raise exception 'Student is not eligible for replacement' using errcode='23514';
    end if;
    select v.* into payer_version from app.fee_payer_version v where v.student_id=original.student_id and v.effective_month<=original.period
      order by v.effective_month desc,v.revision desc limit 1;
    select g.* into payer from app.billing_guardian_choices(original.student_id) g where g.id=payer_version.guardian_id and g.active_account;
    if not found then raise exception 'Active payer required' using errcode='23514'; end if;
    select s.currency::text into school_currency from app.school_settings s where s.singleton for share;
    select c.bank_id into bank_key from app.collection_bank_setting c where c.singleton for share;
    if school_currency is distinct from original.currency::text or
      (bank_key is null and not coalesce((select c.cash_enabled from app.receipt_configuration c where c.singleton),false)) then
      raise exception 'Collection settings unavailable' using errcode='23514';
    end if;
    reference_key:=app.transfer_reference(original.student_id);
    insert into app.invoice as j(invoice_number,student_id,student_number,student_name,guardian_id,payer_account_id,payer_name,period,
      kind,manual_source_id,due_date,currency,total_minor,tariff_id,payer_version_id,issued_bank_id,transfer_reference,issued_by)
    select 'MA-R-'||to_char(original.period,'YYYYMM')||'-'||nextval('app.invoice_number_seq'::regclass)::text,
      s.id,s.student_number,s.display_name,payer.id,payer.account_id,payer.display_name,original.period,
      original.kind,original.manual_source_id,original.due_date,original.currency,original.total_minor,original.tariff_id,payer_version.id,bank_key,reference_key,app.actor_account()
      from app.student s where s.id=original.student_id returning j.* into corrected;
    insert into app.invoice_line(invoice_id,student_id,source_key,ordinal,title_ar,title_de,amount_minor)
      select corrected.id,l.student_id,'replacement:'||corrected.id::text||':'||l.ordinal,l.ordinal,l.title_ar,l.title_de,l.amount_minor
      from app.invoice_line l where l.invoice_id=target;
    update app.invoice_cancellation c set replacement_id=corrected.id where c.invoice_id=target;
    update app.invoice j set revision=j.revision+1 where j.id=target;
  else
    raise exception 'Invalid invoice correction' using errcode='23514';
  end if;
  return query select corrected.id,corrected.student_id,corrected.payer_account_id,to_char(corrected.period,'YYYY-MM'),corrected.due_date::text,corrected.revision;
end
$$;
revoke all on function app.invoice_correction_options(uuid),app.correct_invoice(uuid,integer,text,text) from public,anon,authenticated,service_role;
grant execute on function app.invoice_correction_options(uuid),app.correct_invoice(uuid,integer,text,text) to app_runtime;
