-- Dashboard aggregates use only the existing accounting ledger and authorized staff.
create function app.finance_overview(month_key date)
returns table(school_month date,currency text,active bigint,paused bigint,months jsonb)
language sql stable security definer set search_path=pg_catalog
as $$
  with cfg as (select s.currency::text as currency,app.billing_school_month() as current_month
    from app.school_settings s where s.singleton and app.finance_receipt_staff()),
  periods as (select generate_series(month_key-interval '5 months',month_key,interval '1 month')::date as period),
  net as (
    select date_trunc('month',r.received_date::timestamp)::date as period,r.method,
      greatest(0,r.amount_minor-app.finance_refunded_minor(r.id,'infinity'::timestamptz)) as amount
    from app.finance_receipt r join cfg c on c.currency=r.currency::text
    where r.received_date>=month_key-interval '5 months' and r.received_date<month_key+interval '1 month'
      and not exists(select 1 from app.receipt_posting p where p.receipt_id=r.id and p.kind='void_receipt')
  )
  select c.current_month,c.currency,
    (select count(*) from app.student s where app.billing_eligible(s.id,month_key,null)),
    (select count(distinct s.student_id) from app.enrollment_stop s where s.state='approved' and month_key<@daterange(s.start_month,s.end_month,'[)')),
    (select jsonb_agg(jsonb_build_object('month',to_char(p.period,'YYYY-MM'),
      'cash',coalesce((select sum(n.amount)::bigint from net n where n.period=p.period and n.method='cash'),0),
      'bank',coalesce((select sum(n.amount)::bigint from net n where n.period=p.period and n.method='bank'),0)) order by p.period) from periods p)
  from cfg c where month_key<=c.current_month and extract(day from month_key)=1
$$;
revoke all on function app.finance_overview(date) from public,anon,authenticated,service_role;
grant execute on function app.finance_overview(date) to app_runtime;
