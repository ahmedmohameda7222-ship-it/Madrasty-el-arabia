create function app.valid_fee_lines(items jsonb) returns boolean
language sql immutable set search_path=pg_catalog
as $$
  select case when jsonb_typeof(items)='array' then jsonb_array_length(items) between 1 and 20 and not exists (
    select 1 from jsonb_array_elements(items) as t(item)
    where jsonb_typeof(item) is distinct from 'object'
      or jsonb_typeof(item->'titleAr') is distinct from 'string' or char_length(btrim(item->>'titleAr')) not between 1 and 120
      or jsonb_typeof(item->'titleDe') is distinct from 'string' or char_length(btrim(item->>'titleDe')) not between 1 and 120
      or jsonb_typeof(item->'amountMinor') is distinct from 'number'
      or case when (item->>'amountMinor') ~ '^[1-9][0-9]{0,12}$'
        then (item->>'amountMinor')::numeric>1000000000000 else true end
  ) else false end
$$;

create table app.fee_tariff (
  id uuid primary key default gen_random_uuid(),
  effective_month date not null unique check(extract(day from effective_month)=1),
  lines jsonb not null check(app.valid_fee_lines(lines)),
  currency char(3) not null check(currency ~ '^[A-Z]{3}$'),
  due_day smallint not null check(due_day between 1 and 31),
  created_by uuid not null references app.account,
  created_at timestamptz not null default now()
);

create table app.fee_payer_version (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references app.student,
  guardian_id uuid not null references app.guardian_profile,
  effective_month date not null check(extract(day from effective_month)=1),
  revision integer not null check(revision>0),
  created_by uuid not null references app.account,
  created_at timestamptz not null default now(),
  unique(student_id,revision)
);
create index fee_payer_effective_idx on app.fee_payer_version(student_id,effective_month desc,revision desc);

create sequence app.invoice_number_seq as bigint no cycle;
create table app.invoice (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  student_id uuid not null references app.student,
  student_number text not null,
  student_name text not null,
  guardian_id uuid not null references app.guardian_profile,
  payer_account_id uuid not null references app.account,
  payer_name text not null,
  period date not null check(extract(day from period)=1),
  kind text not null check(kind in ('monthly','manual')),
  manual_source_id uuid,
  due_date date not null,
  currency char(3) not null check(currency ~ '^[A-Z]{3}$'),
  total_minor bigint not null check(total_minor between 1 and 20000000000000),
  tariff_id uuid references app.fee_tariff,
  payer_version_id uuid not null references app.fee_payer_version,
  issued_bank_id uuid not null references app.collection_bank_version,
  transfer_reference text not null,
  issued_by uuid not null references app.account,
  issued_at timestamptz not null default now(),
  cancelled_at timestamptz,
  revision integer not null default 1 check(revision>0),
  check((kind='monthly')=(tariff_id is not null)),
  check((kind='manual')=(manual_source_id is not null))
);
create unique index one_monthly_invoice_per_child on app.invoice(student_id,period) where kind='monthly';
create unique index one_manual_invoice_per_source on app.invoice(student_id,manual_source_id) where kind='manual';
create index invoice_payer_history_idx on app.invoice(payer_account_id,period desc,issued_at desc,id desc);
create index invoice_period_queue_idx on app.invoice(period,student_id);
create table app.invoice_line (
  invoice_id uuid not null references app.invoice,
  student_id uuid not null references app.student,
  source_key text not null,
  ordinal smallint not null check(ordinal between 1 and 20),
  title_ar text not null,
  title_de text not null,
  amount_minor bigint not null check(amount_minor between 1 and 1000000000000),
  primary key(invoice_id,ordinal),
  unique(student_id,source_key)
);
create table app.invoice_preview (
  id uuid primary key default gen_random_uuid(),
  issuer_id uuid not null references app.account,
  proposal jsonb not null check(jsonb_typeof(proposal)='object'),
  fingerprint bytea not null check(octet_length(fingerprint)=32),
  revision integer not null default 1 check(revision=1),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index invoice_preview_expiry_idx on app.invoice_preview(expires_at,id);
create table app.invoice_batch (
  id uuid primary key default gen_random_uuid(),
  preview_id uuid not null unique references app.invoice_preview,
  receipt jsonb not null,
  created_at timestamptz not null default now()
);

alter table app.fee_tariff enable row level security;
alter table app.fee_payer_version enable row level security;
alter table app.invoice enable row level security;
alter table app.invoice_line enable row level security;
alter table app.invoice_preview enable row level security;
alter table app.invoice_batch enable row level security;

create function app.billing_school_month() returns date
language sql stable security definer set search_path=pg_catalog
as $$ select date_trunc('month',app.school_today()::timestamp)::date $$;

create function app.billing_guardian_choices(pupil uuid)
returns table(id uuid,display_name text,account_id uuid,active_account boolean)
language sql stable security definer set search_path=pg_catalog
as $$
  select g.id,g.display_name,g.account_id,app.contact_account_active(g.account_id,'guardian')
  from app.guardian_profile g
  where app.has_capability('finance.issue') and exists (
    select 1 from app.child_link l where l.guardian_id=g.id and l.student_id=pupil and l.state='approved'
      and l.effective_from<=now() and (l.effective_until is null or l.effective_until>now())
  )
$$;

create function app.school_tariffs()
returns setof app.fee_tariff
language sql stable security definer set search_path=pg_catalog
as $$ select t.* from app.fee_tariff t where app.has_capability('finance.issue') $$;

create function app.add_school_tariff(starts date,fee_lines jsonb,requested_due_day smallint)
returns uuid language plpgsql security definer set search_path=pg_catalog
as $$
declare school_currency text;
declare version uuid;
begin
  if not app.has_capability('finance.issue') then raise exception 'Fee settings unavailable' using errcode='42501'; end if;
  perform app.lock_school_calendar();
  select s.currency::text into school_currency from app.school_settings s where s.singleton for share;
  if school_currency is null or starts<app.billing_school_month() then
    raise exception 'Invalid effective month or school currency' using errcode='23514';
  end if;
  if exists(select 1 from app.invoice j where j.kind='monthly' and j.period>=starts
    and j.period<coalesce((select min(t.effective_month) from app.fee_tariff t where t.effective_month>starts),'infinity'::date))
  then raise exception 'Monthly charges have been issued for this interval' using errcode='23P01'; end if;
  insert into app.fee_tariff as t(effective_month,lines,currency,due_day,created_by)
  values(starts,fee_lines,school_currency,requested_due_day,app.actor_account()) returning t.id into version;
  return version;
end
$$;

create function app.billing_payer_profile(pupil uuid)
returns table(student_id uuid,student_number text,student_name text,revision integer,designations jsonb)
language sql stable security definer set search_path=pg_catalog
as $$
  select s.id,s.student_number,s.display_name,
    coalesce((select max(v.revision) from app.fee_payer_version v where v.student_id=s.id),0),
    coalesce((
      select jsonb_agg(jsonb_build_object('guardianId',v.guardian_id,'guardianName',g.display_name,
        'effectiveFromMonth',to_char(v.effective_month,'YYYY-MM'),'revision',v.revision) order by v.effective_month desc)
      from (select distinct on (p.effective_month) p.guardian_id,p.effective_month,p.revision
        from app.fee_payer_version p where p.student_id=s.id order by p.effective_month,p.revision desc) v
      join app.guardian_profile g on g.id=v.guardian_id
    ),'[]'::jsonb)
  from app.student s where s.id=pupil and app.has_capability('finance.issue')
$$;

create function app.set_billing_payer(pupil uuid,adult uuid,starts date,expected integer)
returns integer language plpgsql security definer set search_path=pg_catalog
as $$
declare prior integer;
begin
  if not app.has_capability('finance.issue') then raise exception 'Fee settings unavailable' using errcode='42501'; end if;
  perform app.lock_school_calendar();
  perform pg_advisory_xact_lock(hashtextextended('madrasty:billing:'||pupil,0));
  if starts<app.billing_school_month() or not exists(select 1 from app.billing_guardian_choices(pupil) g where g.id=adult) then
    raise exception 'Guardian unavailable for this month' using errcode='23514';
  end if;
  select coalesce(max(v.revision),0) into prior from app.fee_payer_version v where v.student_id=pupil;
  if prior<>expected then return null; end if;
  insert into app.fee_payer_version(student_id,guardian_id,effective_month,revision,created_by)
  values(pupil,adult,starts,prior+1,app.actor_account());
  return prior+1;
end
$$;

create function app.billing_stop_applies(pupil uuid,period_key date) returns boolean
language sql stable set search_path=pg_catalog
as $$ select false $$;

create function app.billing_eligible(pupil uuid,billing_month date,chosen_class uuid default null) returns boolean
language sql stable security definer set search_path=pg_catalog
as $$
  select not app.billing_stop_applies(pupil,billing_month) and exists (
    select 1 from app.student s
    join app.enrollment e on e.student_id=s.id and e.voided_at is null
    join app.school_year y on y.id=e.year_id and y.state in ('active','closed')
    where s.id=pupil and s.state='active' and e.effective_from<billing_month+interval '1 month'
      and e.effective_until>billing_month and (chosen_class is null or e.class_id=chosen_class)
  )
$$;

create function app.billing_pupil_choices(billing_month date,chosen_class uuid,search text,missing_only boolean)
returns table(id uuid,student_number text,student_name text)
language sql stable security definer set search_path=pg_catalog
as $$
  select s.id,s.student_number,s.display_name
  from app.student s where app.has_capability('finance.issue') and s.state='active'
    and (search is null or strpos(lower(s.display_name),lower(search))>0 or strpos(lower(s.student_number),lower(search))>0)
    and (chosen_class is null or app.billing_eligible(s.id,billing_month,chosen_class))
    and (not missing_only or (
      app.billing_eligible(s.id,billing_month,chosen_class) and
      not exists(select 1 from app.invoice j where j.student_id=s.id and j.period=billing_month and j.kind='monthly')
    ))
$$;

create function app.billing_class_choices(billing_month date)
returns table(id uuid,code text,name_ar text,name_de text)
language sql stable security definer set search_path=pg_catalog
as $$
  select c.id,c.code,c.name_ar,c.name_de from app.school_class c join app.school_year y on y.id=c.year_id
  where app.has_capability('finance.issue') and y.state in ('active','closed') and y.starts_on<billing_month+interval '1 month' and y.ends_exclusive>billing_month
$$;


create function app.invoice_preview_rows(proposal jsonb)
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
        when s.bank_id is null then 'bank_missing'
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

create function app.create_invoice_preview(proposal jsonb)
returns table(preview_id uuid,expires_at timestamptz,rows jsonb)
language plpgsql security definer set search_path=pg_catalog
as $$
declare prepared jsonb;
declare saved record;
declare requested integer;
begin
  if not app.has_capability('finance.issue') then raise exception 'Invoice issuance unavailable' using errcode='42501'; end if;
  if proposal->>'kind' not in ('monthly','manual') then raise exception 'Invalid invoice kind' using errcode='23514'; end if;
  if proposal->>'classId' is not null and not exists (
    select 1 from app.billing_class_choices(((proposal->>'period')||'-01')::date) c where c.id=(proposal->>'classId')::uuid
  ) then raise exception 'Billing class unavailable' using errcode='42501'; end if;
  if proposal->>'kind'='manual' and (proposal->>'chargeSourceId' is null
    or coalesce(jsonb_array_length(proposal->'studentIds'),0)<>1 or not app.valid_fee_lines(proposal->'lineItems'))
  then raise exception 'Invalid manual charge' using errcode='23514'; end if;
  prepared:=app.invoice_preview_rows(proposal);
  requested:=coalesce(jsonb_array_length(proposal->'studentIds'),0);
  if jsonb_array_length(prepared)>1000 or (requested>0 and requested<>jsonb_array_length(prepared)) then
    raise exception 'Invalid billing cohort' using errcode='23514';
  end if;
  delete from app.invoice_preview p where p.issuer_id=app.actor_account() and p.expires_at<=now()
    and not exists(select 1 from app.invoice_batch b where b.preview_id=p.id);
  insert into app.invoice_preview as p(issuer_id,proposal,fingerprint,expires_at)
  values(app.actor_account(),proposal,sha256(convert_to(prepared::text,'UTF8')),now()+interval '20 minutes')
  returning p.id,p.expires_at into saved;
  return query select saved.id,saved.expires_at,prepared;
end
$$;

create function app.invoice_preview_owned(target uuid) returns boolean
language sql stable security definer set search_path=pg_catalog
as $$
  select app.has_capability('finance.issue') and exists(
    select 1 from app.invoice_preview p where p.id=target and p.issuer_id=app.actor_account()
  )
$$;

create function app.confirm_invoice_preview(target uuid,expected integer)
returns table(batch_id uuid,inserted boolean,receipt jsonb)
language plpgsql security definer set search_path=pg_catalog
as $$
declare preview record;
declare existing record;
declare entry record;
declare review jsonb;
declare items jsonb:='[]'::jsonb;
declare prior_invoices jsonb:='[]'::jsonb;
declare skipped jsonb:='[]'::jsonb;
declare period_key date;
declare number_key text;
declare stored record;
declare reference_key text;
declare total bigint;
declare result jsonb;
declare batch uuid;
begin
  if not app.has_capability('finance.issue') then raise exception 'Invoice issuance unavailable' using errcode='42501'; end if;
  perform app.lock_school_calendar();
  select p.* into preview from app.invoice_preview p where p.id=target and p.issuer_id=app.actor_account() for update;
  if not found then raise exception 'Invoice preview unavailable' using errcode='42501'; end if;
  if preview.revision<>expected then return; end if;
  select b.id,b.receipt into existing from app.invoice_batch b where b.preview_id=target;
  if found then return query select existing.id,false,existing.receipt; return; end if;
  if preview.expires_at<=now() then return; end if;

  perform 1 from app.collection_bank_setting c where c.singleton for share;
  period_key:=((preview.proposal->>'period')||'-01')::date;
  review:=app.invoice_preview_rows(preview.proposal);
  perform 1 from app.child_link l
    join jsonb_to_recordset(review) as selected("studentId" uuid,"payerId" uuid) on selected."studentId"=l.student_id and selected."payerId"=l.guardian_id
    order by l.id for share of l;
  for entry in select jsonb_array_elements(review) as row loop
    perform pg_advisory_xact_lock(hashtextextended('madrasty:billing:'||(entry.row->>'studentId'),0));
  end loop;
  review:=app.invoice_preview_rows(preview.proposal);
  if sha256(convert_to(review::text,'UTF8')) is distinct from preview.fingerprint then return; end if;

  for entry in select r.* from jsonb_to_recordset(review) as r(
    "studentId" uuid,"studentName" text,"studentNumber" text,"bankVersionId" uuid,"tariffId" uuid,currency text,lines jsonb,
    "dueDate" date,"payerId" uuid,"payerAccountId" uuid,"payerName" text,"payerVersionId" uuid,reference text,"existingId" uuid,outcome text
  ) order by r."studentId" loop
    if entry.outcome='existing' then
      prior_invoices:=prior_invoices||jsonb_build_array(entry."existingId");
      continue;
    elsif entry.outcome<>'ready' then
      skipped:=skipped||jsonb_build_array(jsonb_build_object('studentId',entry."studentId",'reason',entry.outcome));
      continue;
    end if;
    reference_key:=app.transfer_reference(entry."studentId");
    if reference_key is distinct from entry.reference then
      raise exception 'Transfer instructions changed' using errcode='40001';
    end if;
    select sum((x.item->>'amountMinor')::bigint) into total from jsonb_array_elements(entry.lines) x(item);
    number_key:='MA-R-'||to_char(period_key,'YYYYMM')||'-'||nextval('app.invoice_number_seq'::regclass)::text;
    insert into app.invoice as j(invoice_number,student_id,student_number,student_name,guardian_id,payer_account_id,payer_name,period,
      kind,manual_source_id,due_date,currency,total_minor,tariff_id,payer_version_id,issued_bank_id,transfer_reference,issued_by)
    values(number_key,entry."studentId",entry."studentNumber",entry."studentName",entry."payerId",entry."payerAccountId",entry."payerName",
      period_key,preview.proposal->>'kind',(preview.proposal->>'chargeSourceId')::uuid,entry."dueDate",entry.currency,total,entry."tariffId",
      entry."payerVersionId",entry."bankVersionId",reference_key,app.actor_account())
    returning j.id,j.revision into stored;
    insert into app.invoice_line(invoice_id,student_id,source_key,ordinal,title_ar,title_de,amount_minor)
    select stored.id,entry."studentId",case when entry."tariffId" is not null then 'monthly:'||to_char(period_key,'YYYY-MM')
      else 'manual:'||(preview.proposal->>'chargeSourceId') end||':'||x.position,
      x.position,x.item->>'titleAr',x.item->>'titleDe',(x.item->>'amountMinor')::bigint
    from jsonb_array_elements(entry.lines) with ordinality x(item,position);
    items:=items||jsonb_build_array(jsonb_build_object('invoiceId',stored.id,'studentId',entry."studentId",
      'payerId',entry."payerAccountId",'period',to_char(period_key,'YYYY-MM'),'dueDate',entry."dueDate",'revision',stored.revision));
  end loop;
  result:=jsonb_build_object('issued',items,'existing',prior_invoices,'skipped',skipped);
  insert into app.invoice_batch as b(preview_id,receipt) values(target,result) returning b.id into batch;
  return query select batch,true,result;
end
$$;


create function app.invoice_allocated_minor(target uuid) returns bigint
language sql stable set search_path=pg_catalog as $$ select 0::bigint $$;

create function app.invoice_visible_receipts(target uuid) returns jsonb
language sql stable set search_path=pg_catalog as $$ select '[]'::jsonb $$;

create function app.finance_invoice_visible(target uuid) returns boolean
language sql stable security definer set search_path=pg_catalog
as $$
  select exists(select 1 from app.invoice j where j.id=target and (
    (app.actor_persona()='guardian' and j.payer_account_id=app.actor_account())
    or app.has_capability('finance.read')
    or (app.has_capability('finance.issue') and j.issued_by=app.actor_account())
  ))
$$;

create or replace function app.invoice_thread_context(payer uuid,invoice uuid)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
  select payer=app.actor_account() and app.actor_persona()='guardian'
    and exists(select 1 from app.invoice j where j.id=invoice and j.payer_account_id=payer)
$$;

create or replace function app.thread_reference_allowed(kind_key text,target uuid)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
  select case kind_key
    when 'homework' then case when app.actor_persona()='guardian' then exists(
      select 1 from app.homework_roster g cross join lateral app.homework_projection(g.student_id,null,null,target) h
      where g.homework_id=target
    ) else exists(select 1 from app.homework_projection(null,null,null,target)) end
    when 'attendance' then exists(
      select 1 from app.attendance_row r join app.attendance_sheet s on s.id=r.sheet_id where r.id=target and
        (app.has_child_link(r.student_id) or app.attendance_scope(s.class_id,s.school_date,'attendance.read'))
    )
    when 'invoice' then case when app.actor_persona()='guardian' then app.invoice_thread_context(app.actor_account(),target)
      else app.finance_invoice_visible(target) end
    else false end
$$;

create function app.invoice_rows(target uuid,period_key date,pupil uuid,state_filter text,with_details boolean)
returns table(id uuid,invoice_number text,student_id uuid,student_number text,student_name text,payer_name text,
  period date,kind text,due_date date,currency text,total_minor bigint,allocated_minor bigint,balance_minor bigint,state text,
  issued_at timestamptz,cancelled_at timestamptz,revision integer,lines jsonb,payment_instructions jsonb,issue_instructions jsonb,
  receipt_ids jsonb,can_inquire boolean)
language sql stable security definer set search_path=pg_catalog
as $$
  with visible as (
    select j.*,app.invoice_allocated_minor(j.id) as paid
    from app.invoice j
    where (target is null or j.id=target) and (period_key is null or j.period=period_key) and (pupil is null or j.student_id=pupil)
      and app.finance_invoice_visible(j.id)
  ), priced as (
    select j.*,case when j.cancelled_at is not null then 0::bigint else greatest(0,j.total_minor-j.paid) end as remainder,
      case when j.cancelled_at is not null then 'cancelled'
        when j.paid>=j.total_minor then 'paid' when j.paid>0 then 'partial' else 'unpaid' end as current_state
    from visible j
  )
  select j.id,j.invoice_number,j.student_id,j.student_number,j.student_name,j.payer_name,j.period,j.kind,j.due_date,j.currency::text,
    j.total_minor,j.paid,j.remainder,j.current_state,j.issued_at,j.cancelled_at,j.revision,
    case when with_details then coalesce((
      select jsonb_agg(jsonb_build_object('titleAr',i.title_ar,'titleDe',i.title_de,'amountMinor',i.amount_minor) order by i.ordinal)
      from app.invoice_line i where i.invoice_id=j.id
    ),'[]'::jsonb) end,
    case when with_details and j.cancelled_at is null and j.remainder>0 then jsonb_build_object(
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

insert into app.audit_action_rule(action,resource_kind,change_category,allowed_capabilities,link_kind)
values ('finance.tariff_created','finance','creation',array['finance.issue','finance.read'],null),
  ('finance.payer_designated','finance','settings',array['finance.issue','finance.read'],null),
  ('finance.invoice_batch_issued','finance','creation',array['finance.issue','finance.read'],null);

revoke all on function app.valid_fee_lines(jsonb),app.billing_school_month(),app.billing_guardian_choices(uuid),
  app.school_tariffs(),app.add_school_tariff(date,jsonb,smallint),app.billing_payer_profile(uuid),
  app.set_billing_payer(uuid,uuid,date,integer),app.billing_stop_applies(uuid,date),app.billing_eligible(uuid,date,uuid),
  app.billing_pupil_choices(date,uuid,text,boolean),app.billing_class_choices(date),app.invoice_preview_rows(jsonb),
  app.create_invoice_preview(jsonb),app.invoice_preview_owned(uuid),app.confirm_invoice_preview(uuid,integer),
  app.invoice_allocated_minor(uuid),app.invoice_visible_receipts(uuid),app.finance_invoice_visible(uuid),
  app.invoice_rows(uuid,date,uuid,text,boolean) from public,anon,authenticated,service_role;
grant execute on function app.billing_school_month(),app.billing_guardian_choices(uuid),
  app.school_tariffs(),app.add_school_tariff(date,jsonb,smallint),app.billing_payer_profile(uuid),app.set_billing_payer(uuid,uuid,date,integer),
  app.billing_pupil_choices(date,uuid,text,boolean),app.billing_class_choices(date),app.create_invoice_preview(jsonb),
  app.invoice_preview_owned(uuid),app.confirm_invoice_preview(uuid,integer),app.invoice_rows(uuid,date,uuid,text,boolean)
to app_runtime;


create function app.billing_context()
returns table(school_month date,currency text,due_day integer,bank_ready boolean)
language sql stable security definer set search_path=pg_catalog
as $$
  select app.billing_school_month(),s.currency::text,s.due_day::integer,c.bank_id is not null
  from app.collection_bank_setting c left join app.school_settings s on s.singleton
  where c.singleton and app.has_capability('finance.issue')
$$;
revoke all on function app.billing_context() from public,anon,authenticated,service_role;
grant execute on function app.billing_context() to app_runtime;
