-- Append-only corrections to manually posted cash movements. Receipts retain their own reversal workflow.
create table app.cashbook_movement_reversal (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid not null unique references app.cashbook_movement(id),
  movement_date date not null,
  reason text not null check(char_length(btrim(reason)) between 3 and 500),
  recorded_by uuid not null references app.account,
  recorded_at timestamptz not null default clock_timestamp()
);
alter table app.cashbook_movement_reversal enable row level security;
revoke all on app.cashbook_movement_reversal from public,anon,authenticated,service_role,app_runtime;

create or replace function app.cashbook_all()
returns table(id uuid,movement_date date,kind text,currency text,signed_minor bigint,description text,recorded_by uuid,recorded_at timestamptz,receipt_id uuid)
language sql stable security definer set search_path=pg_catalog
as $$
  select m.id,m.movement_date,m.kind,m.currency::text,m.amount_minor * case when m.kind in ('income','donation') then 1 else -1 end,
    m.description,m.recorded_by,m.recorded_at,null::uuid
  from app.cashbook_movement m where app.finance_receipt_staff()
  union all
  select r.id,r.received_date,'fee',r.currency::text,r.amount_minor,r.receipt_number,r.recorded_by,r.recorded_at,r.id
  from app.finance_receipt r where r.method='cash' and app.finance_receipt_staff()
  union all
  select p.id,(p.posted_at at time zone s.timezone)::date,'void',r.currency::text,-r.amount_minor,r.receipt_number,p.actor_id,p.posted_at,r.id
  from app.receipt_posting p join app.finance_receipt r on r.id=p.receipt_id
  cross join app.school_settings s where s.singleton and p.kind='void_receipt' and r.method='cash' and app.finance_receipt_staff()
  union all
  select f.id,f.refunded_date,'refund',r.currency::text,-f.amount_minor,r.receipt_number,f.posted_by,f.posted_at,r.id
  from app.stop_cash_refund f join app.finance_receipt r on r.id=f.receipt_id where r.method='cash' and app.finance_receipt_staff()
  union all
  select v.id,v.movement_date,'void',m.currency::text,
    m.amount_minor * case when m.kind in ('income','donation') then -1 else 1 end,
    v.reason,v.recorded_by,v.recorded_at,null::uuid
  from app.cashbook_movement_reversal v join app.cashbook_movement m on m.id=v.movement_id
  where app.finance_receipt_staff()
$$;


create or replace function app.cashbook_month(month_key date)
returns table(currency text,school_date date,opening_minor bigint,balance_minor bigint,income_minor bigint,expense_minor bigint,
  deposits_minor bigint,refunds_minor bigint,corrections_minor bigint,closing_minor bigint,entries jsonb,entry_count bigint,can_post boolean)
language sql stable security definer set search_path=pg_catalog
as $$
  with cfg as (select s.currency::text as currency,app.school_today() as today from app.school_settings s where s.singleton and app.finance_receipt_staff()),
  all_rows as (select a.* from app.cashbook_all() a join cfg c on c.currency=a.currency),
  month_rows as (select * from all_rows a where a.movement_date>=month_key and a.movement_date<month_key+interval '1 month')
  select c.currency,c.today,
    coalesce((select sum(a.signed_minor)::bigint from all_rows a where a.movement_date<month_key),0),
    coalesce((select sum(a.signed_minor)::bigint from all_rows a where a.movement_date<=c.today),0),
    coalesce((select sum(a.signed_minor)::bigint from month_rows a where a.kind in ('fee','income','donation')),0),
    coalesce((select -sum(a.signed_minor)::bigint from month_rows a where a.kind='expense'),0),
    coalesce((select -sum(a.signed_minor)::bigint from month_rows a where a.kind='bank_deposit'),0),
    coalesce((select -sum(a.signed_minor)::bigint from month_rows a where a.kind='refund'),0),
    coalesce((select -sum(a.signed_minor)::bigint from month_rows a where a.kind='void'),0),
    coalesce((select sum(a.signed_minor)::bigint from all_rows a where a.movement_date<month_key+interval '1 month'),0),
    coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'date',a.movement_date::text,'kind',a.kind,'signedMinor',a.signed_minor,
      'description',a.description,'actorId',a.recorded_by,'recordedAt',to_char(a.recorded_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'receiptId',a.receipt_id,
      'reversalOf',(select v.movement_id from app.cashbook_movement_reversal v where v.id=a.id),
      'canReverse',app.has_capability('finance.post') and exists(select 1 from app.cashbook_movement m where m.id=a.id)
        and not exists(select 1 from app.cashbook_movement_reversal v where v.movement_id=a.id))
      order by a.movement_date desc,a.recorded_at desc,a.id) from (select * from month_rows order by movement_date desc,recorded_at desc,id limit 1000) a),'[]'::jsonb),
    (select count(*) from month_rows),app.has_capability('finance.post')
  from cfg c where extract(day from month_key)=1 and month_key<=date_trunc('month',c.today)::date
$$;


create function app.reverse_cashbook_movement(target uuid,explanation text)
returns uuid language plpgsql volatile security definer set search_path=pg_catalog
as $$
declare original app.cashbook_movement%rowtype;
declare stored uuid;
declare available bigint;
begin
  if not app.has_capability('finance.post') then raise exception 'Cashbook unavailable' using errcode='42501'; end if;
  perform app.lock_school_calendar();
  select m.* into original from app.cashbook_movement m where m.id=target for update;
  if not found then return null; end if;
  if exists(select 1 from app.cashbook_movement_reversal v where v.movement_id=target) then
    raise exception 'Cash movement already corrected' using errcode='23505';
  end if;
  if explanation is null or char_length(btrim(explanation)) not between 3 and 500 then
    raise exception 'Invalid correction reason' using errcode='23514';
  end if;
  if original.kind in ('income','donation') then
    select coalesce(sum(a.signed_minor),0)::bigint into available from app.cashbook_all() a
      where a.currency=original.currency::text and a.movement_date<=app.school_today();
    if original.amount_minor>available then raise exception 'Insufficient recorded cash balance' using errcode='23514'; end if;
  end if;
  insert into app.cashbook_movement_reversal(movement_id,movement_date,reason,recorded_by)
    values(original.id,app.school_today(),btrim(explanation),app.actor_account()) returning id into stored;
  return stored;
end
$$;
revoke all on function app.reverse_cashbook_movement(uuid,text) from public,anon,authenticated,service_role,app_runtime;
grant execute on function app.reverse_cashbook_movement(uuid,text) to app_runtime;
