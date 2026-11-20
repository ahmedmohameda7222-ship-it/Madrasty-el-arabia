create table app.receipt_configuration (
  singleton boolean primary key default true check(singleton),
  cash_enabled boolean not null default false
);
insert into app.receipt_configuration default values;

create sequence app.receipt_number_seq as bigint no cycle;
create table app.finance_receipt (
  id uuid primary key default gen_random_uuid(),
  receipt_number text not null unique,
  method text not null check(method in ('bank','cash')),
  external_ref text not null check(char_length(external_ref) between 1 and 160 and btrim(external_ref)=external_ref),
  external_key text generated always as (lower(regexp_replace(external_ref,'[[:space:]]+',' ','g'))) stored,
  received_date date not null,
  currency char(3) not null check(currency ~ '^[A-Z]{3}$'),
  amount_minor bigint not null check(amount_minor between 1 and 100000000000000),
  suggested_invoice_id uuid references app.invoice,
  recorded_by uuid not null references app.account,
  recorded_at timestamptz not null,
  unique(method,external_key)
);

create table app.receipt_posting (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references app.finance_receipt,
  revision integer not null check(revision>0),
  kind text not null check(kind in ('record','allocate','unapply','void_receipt')),
  reason text check(reason is null or char_length(btrim(reason)) between 3 and 500),
  actor_id uuid not null references app.account,
  posted_at timestamptz not null,
  check((reason is null)=(kind in ('record','allocate'))),
  check((revision=1)=(kind='record')),
  unique(receipt_id,revision),
  unique(receipt_id,id)
);
create unique index receipt_void_once on app.receipt_posting(receipt_id) where kind='void_receipt';

create table app.receipt_allocation (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references app.finance_receipt,
  posting_id uuid not null,
  invoice_id uuid not null references app.invoice,
  amount_minor bigint not null check(amount_minor between 1 and 20000000000000),
  foreign key(receipt_id,posting_id) references app.receipt_posting(receipt_id,id),
  unique(receipt_id,id),
  unique(posting_id,invoice_id)
);
create index receipt_allocation_invoice_idx on app.receipt_allocation(invoice_id,receipt_id);

create table app.receipt_reversal (
  receipt_id uuid not null references app.finance_receipt,
  posting_id uuid not null,
  allocation_id uuid primary key,
  foreign key(receipt_id,posting_id) references app.receipt_posting(receipt_id,id),
  foreign key(receipt_id,allocation_id) references app.receipt_allocation(receipt_id,id)
);
create index receipt_reversal_posting_idx on app.receipt_reversal(posting_id);

create table app.payer_receipt (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references app.finance_receipt,
  payer_id uuid not null references app.account,
  receipt_number text not null unique,
  unique(receipt_id,payer_id)
);
create index payer_receipt_actor_idx on app.payer_receipt(payer_id,receipt_id);

alter table app.receipt_configuration enable row level security;
alter table app.finance_receipt enable row level security;
alter table app.receipt_posting enable row level security;
alter table app.receipt_allocation enable row level security;
alter table app.receipt_reversal enable row level security;
alter table app.payer_receipt enable row level security;

-- Preserve the original posting time and use new journal rows for corrections.
create function app.receipt_money(target uuid,cutoff timestamptz)
returns table(active_minor bigint,applied_minor bigint,remainder_minor bigint,voided boolean,revision integer)
language sql stable set search_path=pg_catalog
as $$
  select priced.active,priced.applied,priced.active-priced.applied,priced.voided,priced.revision
  from (
    select r.amount_minor*case when journals.voided then 0 else 1 end as active,
      (select coalesce(sum(a.amount_minor),0)::bigint from app.receipt_allocation a
        join app.receipt_posting p on p.id=a.posting_id and p.posted_at<cutoff
        where a.receipt_id=r.id and not exists(select 1 from app.receipt_reversal x
          join app.receipt_posting q on q.id=x.posting_id and q.posted_at<cutoff where x.allocation_id=a.id)) as applied,
      journals.voided,journals.revision
    from app.finance_receipt r cross join lateral (
      select coalesce(bool_or(p.kind='void_receipt'),false) as voided,max(p.revision) as revision
      from app.receipt_posting p where p.receipt_id=r.id and p.posted_at<cutoff
    ) journals
    where r.id=target and r.recorded_at<cutoff
  ) priced
$$;

create function app.invoice_net_allocated(target uuid,cutoff timestamptz) returns bigint
language sql stable set search_path=pg_catalog
as $$
  select coalesce(sum(a.amount_minor),0)::bigint from app.receipt_allocation a
  join app.receipt_posting p on p.id=a.posting_id and p.posted_at<cutoff
  where a.invoice_id=target and not exists(select 1 from app.receipt_reversal x
    join app.receipt_posting q on q.id=x.posting_id and q.posted_at<cutoff where x.allocation_id=a.id)
$$;

create or replace function app.invoice_allocated_minor(target uuid) returns bigint
language sql stable set search_path=pg_catalog
as $$ select app.invoice_net_allocated(target,'infinity'::timestamptz) $$;

create function app.invoice_collectible_minor(target uuid,cutoff timestamptz) returns bigint
language sql stable set search_path=pg_catalog
as $$
  select case when j.cancelled_at<cutoff then 0::bigint else j.total_minor end from app.invoice j
  where j.id=target and j.issued_at<cutoff
$$;

create function app.finance_receipt_staff() returns boolean
language sql stable set search_path=pg_catalog
as $$ select app.has_capability('finance.read') or app.has_capability('finance.post') $$;

create function app.finance_receipt_posting_target(target uuid) returns boolean
language sql stable security definer set search_path=pg_catalog
as $$ select app.has_capability('finance.post') and exists(select 1 from app.finance_receipt r where r.id=target) $$;

create function app.finance_receipt_invoice_target(target uuid) returns boolean
language sql stable security definer set search_path=pg_catalog
as $$ select app.has_capability('finance.post') and exists(select 1 from app.invoice j where j.id=target) $$;

create or replace function app.finance_invoice_visible(target uuid) returns boolean
language sql stable security definer set search_path=pg_catalog
as $$
  select exists(select 1 from app.invoice j where j.id=target and (
    (app.actor_persona()='guardian' and j.payer_account_id=app.actor_account())
    or app.finance_receipt_staff()
    or (app.has_capability('finance.issue') and j.issued_by=app.actor_account())
  ))
$$;

create or replace function app.invoice_visible_receipts(target uuid) returns jsonb
language sql stable set search_path=pg_catalog
as $$
  select coalesce(jsonb_agg(ids.ref order by ids.ref),'[]'::jsonb) from (
    select distinct case when app.finance_receipt_staff() then a.receipt_id else visible.id end as ref
    from app.receipt_allocation a join app.invoice j on j.id=a.invoice_id
    left join app.payer_receipt visible on visible.receipt_id=a.receipt_id and visible.payer_id=j.payer_account_id
    where a.invoice_id=target and (app.finance_receipt_staff() or
      (app.actor_persona()='guardian' and j.payer_account_id=app.actor_account()))
  ) ids where ids.ref is not null
$$;

create function app.finance_receipt_options()
returns table(school_date date,currency text,cash_enabled boolean)
language sql stable security definer set search_path=pg_catalog
as $$
  select app.school_today(),s.currency::text,c.cash_enabled
  from app.school_settings s cross join app.receipt_configuration c
  where s.singleton and c.singleton and app.has_capability('finance.post')
$$;

-- All ledger writers take the calendar lock before any receipt, child or invoice lock.
-- Stop decisions take the same lock so they cannot race a posting against a changed balance.
create function app.lock_receipt_invoices(targets uuid[]) returns void
language plpgsql volatile set search_path=pg_catalog
as $$
declare pupil uuid;
begin
  for pupil in select distinct j.student_id from app.invoice j where j.id=any(targets) order by j.student_id loop
    perform pg_advisory_xact_lock(hashtextextended('madrasty:billing:'||pupil::text,0));
  end loop;
  perform 1 from app.invoice j where j.id=any(targets) order by j.id for update;
end
$$;

create function app.receipt_add_allocation(target uuid,posting uuid,invoice_key uuid,amount bigint) returns void
language plpgsql volatile set search_path=pg_catalog
as $$
begin
  insert into app.receipt_allocation(receipt_id,posting_id,invoice_id,amount_minor)
    values(target,posting,invoice_key,amount);
  insert into app.payer_receipt(receipt_id,payer_id,receipt_number)
    select target,j.payer_account_id,'MA-Z-'||upper(replace(gen_random_uuid()::text,'-','')) from app.invoice j where j.id=invoice_key
    on conflict(receipt_id,payer_id) do nothing;
  update app.invoice j set revision=j.revision+1 where j.id=invoice_key;
end
$$;

create function app.receipt_posting_event(target uuid) returns jsonb
language sql stable set search_path=pg_catalog
as $$
  select jsonb_build_object('receiptId',p.receipt_id,'postingId',p.id,'revision',p.revision,'kind',p.kind,
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'allocationId',a.id,'invoiceId',j.id,'invoiceRevision',j.revision,'studentId',j.student_id,
      'payerId',j.payer_account_id,'payerReceiptId',visible.id,'balanceMinor',
        greatest(0,app.invoice_collectible_minor(j.id,'infinity'::timestamptz)-app.invoice_allocated_minor(j.id)))
      order by j.id,a.id)
      from app.receipt_allocation a join app.invoice j on j.id=a.invoice_id
      join app.payer_receipt visible on visible.receipt_id=a.receipt_id and visible.payer_id=j.payer_account_id
      where a.posting_id=p.id or exists(select 1 from app.receipt_reversal x where x.posting_id=p.id and x.allocation_id=a.id)
    ),'[]'::jsonb))
  from app.receipt_posting p where p.id=target
$$;

create function app.record_finance_receipt(external_ref text,channel text,received date,currency_code text,amount bigint,
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
  if j.id is not null and j.currency=r.currency and j.cancelled_at is null
    and app.invoice_collectible_minor(j.id,'infinity'::timestamptz)-app.invoice_allocated_minor(j.id)=amount then
    perform app.receipt_add_allocation(r.id,posting_id,j.id,amount);
  end if;
  return query select r.id,r.receipt_number,m.remainder_minor,m.revision,app.receipt_posting_event(posting_id)
    from app.receipt_money(r.id,'infinity'::timestamptz) m;
end
$$;

create function app.allocate_finance_receipt(target uuid,expected integer,lines jsonb)
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
    or total_amount>m.remainder_minor then raise exception 'Invalid receipt allocation' using errcode='23514'; end if;

  perform app.lock_receipt_invoices(targets);
  for entry in
    select i.*,j.id,j.revision,j.cancelled_at,j.currency,
      app.invoice_collectible_minor(j.id,'infinity'::timestamptz)-app.invoice_allocated_minor(j.id) as balance
    from jsonb_to_recordset(lines) i("invoiceId" uuid,"amountMinor" bigint,"invoiceRevision" integer)
    left join app.invoice j on j.id=i."invoiceId" order by i."invoiceId"
  loop
    if entry.id is null then raise exception 'Invoice unavailable' using errcode='42501'; end if;
    if entry.revision<>entry."invoiceRevision" then return; end if;
    if entry.cancelled_at is not null or entry.currency<>r.currency or
      entry."amountMinor" not between 1 and entry.balance or entry."amountMinor" is null then
      raise exception 'Invoice balance or currency unavailable' using errcode='23514';
    end if;
  end loop;

  insert into app.receipt_posting as p(receipt_id,kind,revision,actor_id,posted_at)
  values(target,'allocate',expected+1,app.actor_account(),clock_timestamp()) returning p.id into posting_id;
  for entry in select i.* from jsonb_to_recordset(lines) i("invoiceId" uuid,"amountMinor" bigint) order by i."invoiceId" loop
    perform app.receipt_add_allocation(target,posting_id,entry."invoiceId",entry."amountMinor");
  end loop;
  return query select r.id,r.receipt_number,current_money.remainder_minor,current_money.revision,app.receipt_posting_event(posting_id)
    from app.receipt_money(r.id,'infinity'::timestamptz) current_money;
end
$$;

create function app.reverse_finance_receipt(target uuid,expected integer,operation text,selected uuid[],explanation text)
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
  return query select r.id,r.receipt_number,current_money.remainder_minor,current_money.revision,app.receipt_posting_event(posting_id)
    from app.receipt_money(r.id,'infinity'::timestamptz) current_money;
end
$$;


create function app.receipt_allocation_details(target uuid,payer uuid) returns jsonb
language sql stable set search_path=pg_catalog
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'invoiceId',j.id,'invoiceNumber',j.invoice_number,
    'studentName',j.student_name,'studentNumber',j.student_number,'period',to_char(j.period,'YYYY-MM'),'amountMinor',a.amount_minor,
    'postedAt',to_char(p.posted_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'reversedAt',to_char(q.posted_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'reason',case when payer is null then q.reason end,'invoiceBalanceMinor',case when payer is null then
      greatest(0,app.invoice_collectible_minor(j.id,'infinity'::timestamptz)-app.invoice_allocated_minor(j.id)) end)
      order by p.revision,a.id),'[]'::jsonb)
  from app.receipt_allocation a join app.invoice j on j.id=a.invoice_id
  join app.receipt_posting p on p.id=a.posting_id
  left join app.receipt_reversal x on x.allocation_id=a.id left join app.receipt_posting q on q.id=x.posting_id
  where a.receipt_id=target and (payer is null or j.payer_account_id=payer)
$$;

create function app.receipt_staff_rows(target uuid,state_filter text,after_at timestamptz,after_id uuid,row_limit integer,details boolean)
returns table(id uuid,receipt_number text,method text,received_date date,currency text,amount_minor bigint,active_minor bigint,
  applied_minor bigint,remainder_minor bigint,state text,recorded_at timestamptz,revision integer,external_ref text,
  suggested_invoice_id uuid,allocations jsonb,history jsonb,can_post boolean)
language sql stable security definer set search_path=pg_catalog
as $$
  with visible as (
    select r.*,m.active_minor,m.applied_minor,m.remainder_minor,m.revision,
      case when m.voided then 'voided' when m.remainder_minor>0 then 'needs_matching' else 'allocated' end as state
    from app.finance_receipt r cross join lateral app.receipt_money(r.id,'infinity'::timestamptz) m
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
      'revision',p.revision,'kind',p.kind,'reason',p.reason,'postedAt',
      to_char(p.posted_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) order by p.revision)
      from app.receipt_posting p where p.receipt_id=r.id),'[]'::jsonb) end,
    r.state<>'voided' and app.has_capability('finance.post')
  from selected r order by r.recorded_at desc,r.id desc
$$;

create function app.receipt_payer_document(target uuid)
returns table(id uuid,receipt_number text,method text,received_date date,currency text,recorded_at timestamptz,original_minor bigint,
  applied_minor bigint,allocations jsonb)
language sql stable security definer set search_path=pg_catalog
as $$
  select own.id,own.receipt_number,r.method,r.received_date,r.currency::text,r.recorded_at,
    totals.original,totals.applied,app.receipt_allocation_details(r.id,own.payer_id)
  from app.payer_receipt own join app.finance_receipt r on r.id=own.receipt_id
  cross join lateral (
    select coalesce(sum(a.amount_minor),0)::bigint as original,
      coalesce(sum(a.amount_minor) filter(where x.allocation_id is null),0)::bigint as applied
    from app.receipt_allocation a join app.invoice j on j.id=a.invoice_id and j.payer_account_id=own.payer_id
    left join app.receipt_reversal x on x.allocation_id=a.id where a.receipt_id=r.id
  ) totals
  where app.actor_persona()='guardian' and own.id=target and own.payer_id=app.actor_account()
$$;

insert into app.audit_action_rule(action,resource_kind,change_category,allowed_capabilities,link_kind)
values ('finance.receipt_recorded','finance','creation',array['finance.post','finance.read'],null),
  ('finance.receipt_allocated','finance','update',array['finance.post','finance.read'],null),
  ('finance.receipt_reversed','finance','update',array['finance.post','finance.read'],null);

revoke all on function app.receipt_money(uuid,timestamptz),app.invoice_net_allocated(uuid,timestamptz),
  app.invoice_collectible_minor(uuid,timestamptz),app.finance_receipt_staff(),app.finance_receipt_posting_target(uuid),
  app.finance_receipt_invoice_target(uuid),app.finance_receipt_options(),app.lock_receipt_invoices(uuid[]),
  app.receipt_add_allocation(uuid,uuid,uuid,bigint),app.receipt_posting_event(uuid),
  app.record_finance_receipt(text,text,date,text,bigint,uuid,boolean),app.allocate_finance_receipt(uuid,integer,jsonb),
  app.reverse_finance_receipt(uuid,integer,text,uuid[],text),app.receipt_allocation_details(uuid,uuid),
  app.receipt_staff_rows(uuid,text,timestamptz,uuid,integer,boolean),app.receipt_payer_document(uuid)
from public,anon,authenticated,service_role;
grant execute on function app.finance_receipt_staff(),app.finance_receipt_posting_target(uuid),app.finance_receipt_invoice_target(uuid),
  app.finance_receipt_options(),app.record_finance_receipt(text,text,date,text,bigint,uuid,boolean),
  app.allocate_finance_receipt(uuid,integer,jsonb),app.reverse_finance_receipt(uuid,integer,text,uuid[],text),
  app.receipt_staff_rows(uuid,text,timestamptz,uuid,integer,boolean),app.receipt_payer_document(uuid)
to app_runtime;
