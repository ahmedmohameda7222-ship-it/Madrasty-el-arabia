-- The existing receipt journal supplies cash fee receipts, refunds and void corrections.
create table app.cashbook_movement (
  id uuid primary key default gen_random_uuid(),
  movement_date date not null,
  kind text not null check(kind in ('income','donation','expense','bank_deposit')),
  currency char(3) not null check(currency ~ '^[A-Z]{3}$'),
  amount_minor bigint not null check(amount_minor between 1 and 100000000000000),
  description text not null check(char_length(btrim(description)) between 3 and 500),
  recorded_by uuid not null references app.account,
  recorded_at timestamptz not null default clock_timestamp()
);
create index cashbook_movement_date on app.cashbook_movement(movement_date desc,recorded_at desc,id);
alter table app.cashbook_movement enable row level security;
revoke all on app.cashbook_movement from public,anon,authenticated,app_runtime;

create function app.cashbook_all()
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
$$;

create function app.cashbook_month(month_key date)
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
      'description',a.description,'actorId',a.recorded_by,'recordedAt',to_char(a.recorded_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'receiptId',a.receipt_id)
      order by a.movement_date desc,a.recorded_at desc,a.id) from (select * from month_rows order by movement_date desc,recorded_at desc,id limit 1000) a),'[]'::jsonb),
    (select count(*) from month_rows),app.has_capability('finance.post')
  from cfg c where extract(day from month_key)=1 and month_key<=date_trunc('month',c.today)::date
$$;

create function app.add_cashbook_movement(day_key date,movement_kind text,amount bigint,explanation text)
returns uuid language plpgsql volatile security definer set search_path=pg_catalog
as $$
declare currency_key text;
declare stored uuid;
declare available bigint;
begin
  if not app.has_capability('finance.post') then raise exception 'Cashbook unavailable' using errcode='42501'; end if;
  perform app.lock_school_calendar();
  select s.currency::text into currency_key from app.school_settings s where s.singleton;
  if day_key>app.school_today() or day_key is null or currency_key is null or amount is null or amount<1 then
    raise exception 'Invalid cash movement' using errcode='23514';
  end if;
  if movement_kind in ('expense','bank_deposit') then
    select coalesce(sum(a.signed_minor),0)::bigint into available from app.cashbook_all() a where a.currency=currency_key and a.movement_date<=app.school_today();
    if amount>available then raise exception 'Insufficient recorded cash balance' using errcode='23514'; end if;
  end if;
  insert into app.cashbook_movement(movement_date,kind,currency,amount_minor,description,recorded_by)
  values(day_key,movement_kind,currency_key,amount,btrim(explanation),app.actor_account()) returning id into stored;
  return stored;
end
$$;
revoke all on function app.cashbook_all(),app.cashbook_month(date),app.add_cashbook_movement(date,text,bigint,text) from public,anon,authenticated;
grant execute on function app.cashbook_month(date),app.add_cashbook_movement(date,text,bigint,text) to app_runtime;
