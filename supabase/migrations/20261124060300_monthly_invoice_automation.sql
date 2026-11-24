-- Explicit, revocable school authorization for the private scheduled issuer.
create table app.monthly_billing_configuration(
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  starts_month date,
  configured_by uuid references app.account,
  revision integer not null default 0,
  check(not enabled or (starts_month is not null and configured_by is not null))
);
insert into app.monthly_billing_configuration default values;
alter table app.monthly_billing_configuration enable row level security;
revoke all on app.monthly_billing_configuration from public,anon,authenticated,service_role,app_runtime;

create function app.monthly_billing_settings() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog
as $$
begin
  if not app.has_capability('finance.issue') then raise exception 'Billing settings unavailable' using errcode='42501'; end if;
  return (select jsonb_build_object('enabled',c.enabled,'startsMonth',to_char(c.starts_month,'YYYY-MM'),'revision',c.revision,
    'nextMonth',to_char(app.billing_school_month()+interval '1 month','YYYY-MM')) from app.monthly_billing_configuration c where c.singleton);
end
$$;
create function app.configure_monthly_billing(turn_on boolean,expected integer) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog
as $$
begin
  if not app.has_capability('finance.issue') then raise exception 'Billing settings unavailable' using errcode='42501'; end if;
  perform app.lock_school_calendar();
  update app.monthly_billing_configuration c set enabled=turn_on,
    starts_month=case when turn_on and not c.enabled then (app.billing_school_month()+interval '1 month')::date else c.starts_month end,
    configured_by=app.actor_account(),revision=c.revision+1 where c.singleton and c.revision=expected;
  if not found then return null; end if;
  return app.monthly_billing_settings();
end
$$;

-- Called only by the trusted DB scheduler. Never synthesizes an authenticated user session.
-- The enabling administrator is the attribution, not a forged session.
create function app.run_monthly_billing() returns integer
language plpgsql volatile security definer set search_path=pg_catalog
as $$
declare cfg app.monthly_billing_configuration%rowtype;
declare period_key date:=app.billing_school_month();
declare tariff app.fee_tariff%rowtype;
declare school_currency text;
declare bank_key uuid;
declare due date;
declare total bigint;
declare pupil record;
declare stored uuid;
declare reference_key text;
declare number_key text;
declare issued_count integer:=0;
begin
  perform app.lock_school_calendar();
  select c.* into cfg from app.monthly_billing_configuration c where c.singleton for share;
  if not cfg.enabled or cfg.starts_month>period_key then return 0; end if;
  if not exists(select 1 from app.account a where a.id=cfg.configured_by and a.status='active'
      and 'admin'::app.persona=any(app.active_personas(a.id))
      and (exists(select 1 from app.access_administrator d where d.account_id=a.id and d.revoked_at is null)
      or exists(select 1 from app.capability_grant g where g.account_id=a.id and g.capability='finance.issue' and g.revoked_at is null
        and g.valid_from<=now() and (g.valid_until is null or g.valid_until>now()))))
    then return 0; end if;
  select s.currency::text into school_currency from app.school_settings s where s.singleton for share;
  select c.bank_id into bank_key from app.collection_bank_setting c where c.singleton for share;
  select t.* into tariff from app.fee_tariff t where t.effective_month<=period_key order by t.effective_month desc limit 1;
  if school_currency is null or bank_key is null or tariff.id is null or tariff.currency::text<>school_currency then return 0; end if;
  select sum((x.item->>'amountMinor')::bigint) into total from jsonb_array_elements(tariff.lines) x(item);
  if total is null or total<1 then return 0; end if;
  due:=period_key+(least(tariff.due_day,extract(day from period_key+interval '1 month'-interval '1 day')::integer)-1);
  for pupil in select s.id,s.display_name,s.student_number,v.id as payer_version,v.guardian_id,g.account_id,g.display_name as payer_name
    from app.student s
    join lateral (select p.* from app.fee_payer_version p where p.student_id=s.id and p.effective_month<=period_key order by p.effective_month desc,p.revision desc limit 1) v on true
    join app.guardian_profile g on g.id=v.guardian_id
    where app.billing_eligible(s.id,period_key,null)
      and app.contact_account_active(g.account_id,'guardian')
      and exists(select 1 from app.child_link l where l.student_id=s.id and l.guardian_id=g.id and l.state='approved'
        and l.effective_from<=now() and (l.effective_until is null or l.effective_until>now()))
      and not exists(select 1 from app.invoice j where j.student_id=s.id and j.period=period_key and j.kind='monthly')
    order by s.id limit 500
  loop
    perform pg_advisory_xact_lock(hashtextextended('madrasty:billing:'||pupil.id::text,0));
    if not app.billing_eligible(pupil.id,period_key,null) or exists(select 1 from app.invoice j where j.student_id=pupil.id and j.period=period_key and j.kind='monthly') then continue; end if;
    perform 1 from app.child_link l where l.student_id=pupil.id and l.guardian_id=pupil.guardian_id and l.state='approved'
      and l.effective_from<=now() and (l.effective_until is null or l.effective_until>now()) for share;
    if not found or not app.contact_account_active(pupil.account_id,'guardian') then continue; end if;
    insert into app.student_transfer_reference(student_id,reference) values(pupil.id,app.format_student_transfer_reference(pupil.display_name,pupil.student_number))
      on conflict(student_id) do nothing;
    select r.reference into reference_key from app.student_transfer_reference r where r.student_id=pupil.id;
    number_key:='MA-R-'||to_char(period_key,'YYYYMM')||'-'||nextval('app.invoice_number_seq'::regclass)::text;
    insert into app.invoice as j(invoice_number,student_id,student_number,student_name,guardian_id,payer_account_id,payer_name,period,
      kind,due_date,currency,total_minor,tariff_id,payer_version_id,issued_bank_id,transfer_reference,issued_by)
    values(number_key,pupil.id,pupil.student_number,pupil.display_name,pupil.guardian_id,pupil.account_id,pupil.payer_name,
      period_key,'monthly',due,school_currency,total,tariff.id,pupil.payer_version,bank_key,reference_key,cfg.configured_by)
      on conflict (student_id,period) where kind='monthly' do nothing returning j.id into stored;
    if not found then continue; end if;
    insert into app.invoice_line(invoice_id,student_id,source_key,ordinal,title_ar,title_de,amount_minor)
      select stored,pupil.id,'monthly:'||to_char(period_key,'YYYY-MM')||':'||x.position,x.position,
        x.item->>'titleAr',x.item->>'titleDe',(x.item->>'amountMinor')::bigint
      from jsonb_array_elements(tariff.lines) with ordinality x(item,position);
    insert into app.outbox_event(id,type,occurred_at,actor_id,aggregate_id,payload)
      values(gen_random_uuid(),'invoice.issued',clock_timestamp(),cfg.configured_by,stored,
        jsonb_build_object('invoiceId',stored,'studentId',pupil.id,'payerId',pupil.account_id,'period',to_char(period_key,'YYYY-MM'),'dueDate',due,'revision',1));
    insert into app.audit_entry(actor_id,persona,request_id,action,aggregate_id,metadata)
      values(cfg.configured_by,'admin',gen_random_uuid(),'finance.invoice_automatic',stored,jsonb_build_object('period',to_char(period_key,'YYYY-MM'),'automatic',true));
    issued_count:=issued_count+1;
  end loop;
  return issued_count;
end
$$;
revoke all on function app.monthly_billing_settings(),app.configure_monthly_billing(boolean,integer),app.run_monthly_billing() from public,anon,authenticated,service_role,app_runtime;
grant execute on function app.monthly_billing_settings(),app.configure_monthly_billing(boolean,integer) to app_runtime;
insert into app.audit_action_rule(action,resource_kind,change_category,allowed_capabilities,link_kind)
values ('finance.invoice_automatic','finance','creation',array['finance.issue','finance.read'],null),
 ('finance.monthly_billing_configured','finance','settings',array['finance.issue','finance.read'],null);
