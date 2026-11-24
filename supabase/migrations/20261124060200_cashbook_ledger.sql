-- Cashbook: actual cash receipts are counted once; allocations are not cash movements.
create table app.cashbook_entry(
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  currency char(3) not null check(currency ~ '^[A-Z]{3}$'),
  kind text not null check(kind in ('income','donation','expense','deposit','opening')),
  amount_minor bigint not null check(amount_minor between 1 and 100000000000000),
  description text not null check(char_length(btrim(description)) between 3 and 300),
  recorded_by uuid not null references app.account,
  recorded_at timestamptz not null default clock_timestamp()
);
create unique index cashbook_one_opening_per_currency on app.cashbook_entry(currency) where kind='opening';
alter table app.cashbook_entry enable row level security;
revoke all on app.cashbook_entry from public,anon,authenticated,service_role,app_runtime;

create function app.cashbook_movements()
returns table(id uuid,day date,kind text,signed_minor bigint,currency text,description text,actor_id uuid,posted_at timestamptz)
language sql stable set search_path=pg_catalog
as $$
  select e.id,e.entry_date,e.kind,case when e.kind in ('expense','deposit') then -e.amount_minor else e.amount_minor end,
    e.currency::text,e.description,e.recorded_by,e.recorded_at from app.cashbook_entry e
  union all
  select r.id,r.received_date,'receipt',r.amount_minor,r.currency::text,r.receipt_number,r.recorded_by,r.recorded_at
    from app.finance_receipt r where r.method='cash'
  union all
  select f.id,f.refunded_date,'refund',-f.amount_minor,r.currency::text,r.receipt_number,f.posted_by,f.posted_at
    from app.stop_cash_refund f join app.finance_receipt r on r.id=f.receipt_id where r.method='cash'
  union all
  select p.id,(p.posted_at at time zone s.timezone)::date,'correction',
    -greatest(0,r.amount_minor-coalesce((select sum(f.amount_minor) from app.stop_cash_refund f where f.receipt_id=r.id),0))::bigint,
    r.currency::text,r.receipt_number,p.actor_id,p.posted_at
    from app.receipt_posting p join app.finance_receipt r on r.id=p.receipt_id cross join app.school_settings s
    where r.method='cash' and p.kind='void_receipt' and s.singleton
$$;

create function app.cashbook_report(month_key date)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare current_month date:=app.billing_school_month();
declare school_currency text;
declare selected date:=coalesce(month_key,current_month);
declare payload jsonb;
begin
  if not app.finance_receipt_staff() then raise exception 'Cashbook unavailable' using errcode='42501'; end if;
  if extract(day from selected)<>1 or selected>current_month then raise exception 'Invalid cashbook month' using errcode='23514'; end if;
  select s.currency::text into school_currency from app.school_settings s where s.singleton;
  if school_currency is null then raise exception 'School currency unavailable' using errcode='23514'; end if;
  with all_rows as (select m.* from app.cashbook_movements() m where m.currency=school_currency),
  month_rows as (select * from all_rows where day>=selected and day<selected+interval '1 month'),
  totals as (
    select coalesce(sum(signed_minor) filter(where day<selected),0)::bigint as opening,
      coalesce(sum(signed_minor),0)::bigint as current,
      coalesce(sum(signed_minor) filter(where day<selected+interval '1 month'),0)::bigint as closing
    from all_rows
  ), monthly as (
    select coalesce(sum(signed_minor) filter(where kind in ('income','donation','receipt')),0)::bigint as income,
      -coalesce(sum(signed_minor) filter(where kind='expense'),0)::bigint as expense,
      -coalesce(sum(signed_minor) filter(where kind='deposit'),0)::bigint as deposits,
      -coalesce(sum(signed_minor) filter(where kind='refund'),0)::bigint as refunds,
      coalesce(sum(signed_minor) filter(where kind='correction'),0)::bigint as corrections,count(*) as entry_count
    from month_rows
  )
  select jsonb_build_object('currency',school_currency,'month',to_char(selected,'YYYY-MM'),'schoolDate',app.school_today(),
    'openingMinor',t.opening,'balanceMinor',t.current,'monthEndMinor',t.closing,'incomeMinor',m.income,'expenseMinor',m.expense,
    'depositMinor',m.deposits,'refundMinor',m.refunds,'correctionMinor',m.corrections,'entryCount',m.entry_count,
    'canPost',app.has_capability('finance.post'),'canSetOpening',not exists(select 1 from app.cashbook_entry e where e.kind='opening' and e.currency=school_currency),
    'entries',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'date',x.day,'kind',x.kind,'amountMinor',x.signed_minor,
      'description',x.description,'actor',coalesce((select p.display_name from app.staff_profile p where p.account_id=x.actor_id order by p.id limit 1),'—'))
      order by x.day desc,x.posted_at desc,x.id) from (select * from month_rows order by day desc,posted_at desc,id limit 1000) x),'[]'::jsonb))
    into payload from totals t cross join monthly m;
  return payload;
end
$$;

create function app.post_cashbook_entry(entry_kind text,entry_day date,minor bigint,note text)
returns uuid language plpgsql volatile security definer set search_path=pg_catalog
as $$
declare school_currency text;
declare new_id uuid;
begin
  if not app.has_capability('finance.post') then raise exception 'Cashbook unavailable' using errcode='42501'; end if;
  perform app.lock_school_calendar();
  select s.currency::text into school_currency from app.school_settings s where s.singleton;
  if school_currency is null or entry_day>app.school_today() or entry_day<'1900-01-01'::date
    or entry_kind not in ('income','donation','expense','deposit','opening') or minor not between 1 and 100000000000000
    or char_length(btrim(note)) not between 3 and 300 then raise exception 'Invalid cashbook entry' using errcode='23514'; end if;
  insert into app.cashbook_entry as e(entry_date,currency,kind,amount_minor,description,recorded_by)
    values(entry_day,school_currency,entry_kind,minor,btrim(note),app.actor_account()) returning e.id into new_id;
  return new_id;
end
$$;
revoke all on function app.cashbook_movements(),app.cashbook_report(date),app.post_cashbook_entry(text,date,bigint,text) from public,anon,authenticated,service_role,app_runtime;
grant execute on function app.cashbook_report(date),app.post_cashbook_entry(text,date,bigint,text) to app_runtime;
insert into app.audit_action_rule(action,resource_kind,change_category,allowed_capabilities,link_kind)
values ('finance.cashbook_posted','finance','creation',array['finance.post','finance.read'],null);
