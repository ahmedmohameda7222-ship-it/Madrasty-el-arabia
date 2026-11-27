-- Read-only staff ledger. Transfers appear once, with their cash-side direction.
create function app.finance_ledger_page(month_key date,channel_key text,search_text text,
  after_date date,after_at timestamptz,after_id uuid,row_limit integer)
returns table(id uuid,movement_date date,kind text,channel text,currency text,signed_minor bigint,
  description text,recorded_by uuid,recorded_at timestamptz,receipt_id uuid,reversal_of uuid,can_reverse boolean)
language sql stable security definer set search_path=pg_catalog
as $$
  with cash as (
    select a.id,a.movement_date,a.kind,
      case when a.kind='bank_deposit' or original.kind='bank_deposit' then 'transfer' else 'cash' end as channel,
      a.currency,a.signed_minor,a.description,a.recorded_by,a.recorded_at,a.receipt_id,
      v.movement_id as reversal_of,
      app.has_capability('finance.post') and exists(select 1 from app.cashbook_movement m where m.id=a.id)
        and not exists(select 1 from app.cashbook_movement_reversal x where x.movement_id=a.id) as can_reverse
    from app.cashbook_all() a
    left join app.cashbook_movement_reversal v on v.id=a.id
    left join app.cashbook_movement original on original.id=v.movement_id
    where a.movement_date>=month_key and a.movement_date<month_key+interval '1 month'
  ), bank as (
    select r.id,r.received_date,'fee'::text,'bank'::text,r.currency::text,r.amount_minor,r.receipt_number,r.recorded_by,r.recorded_at,r.id,
      null::uuid,false
    from app.finance_receipt r where r.method='bank' and r.received_date>=month_key and r.received_date<month_key+interval '1 month'
    union all
    select p.id,(p.posted_at at time zone s.timezone)::date,'void','bank',r.currency::text,-r.amount_minor,r.receipt_number,p.actor_id,p.posted_at,r.id,null::uuid,false
    from app.receipt_posting p join app.finance_receipt r on r.id=p.receipt_id
    cross join app.school_settings s where s.singleton and p.kind='void_receipt' and r.method='bank'
      and (p.posted_at at time zone s.timezone)::date>=month_key and (p.posted_at at time zone s.timezone)::date<month_key+interval '1 month'
    union all
    select f.id,f.refunded_date,'refund','bank',r.currency::text,-f.amount_minor,r.receipt_number,f.posted_by,f.posted_at,r.id,null::uuid,false
    from app.stop_cash_refund f join app.finance_receipt r on r.id=f.receipt_id where r.method='bank'
      and f.refunded_date>=month_key and f.refunded_date<month_key+interval '1 month'
  ), all_rows as (select * from cash union all select * from bank)
  select a.* from all_rows a
  where app.finance_receipt_staff() and extract(day from month_key)=1 and month_key<=app.billing_school_month()
    and (channel_key is null or a.channel=channel_key)
    and (after_id is null or (a.movement_date,a.recorded_at,a.id)<(after_date,after_at,after_id))
    and (search_text is null or strpos(lower(a.description),lower(search_text))>0 or exists(
      select 1 from app.finance_receipt r where r.id=a.receipt_id and (
        strpos(lower(r.external_ref),lower(search_text))>0 or exists(
          select 1 from app.invoice j where (j.id=r.suggested_invoice_id or exists(
            select 1 from app.receipt_allocation al where al.receipt_id=r.id and al.invoice_id=j.id))
            and (strpos(lower(j.student_name),lower(search_text))>0 or strpos(lower(j.student_number),lower(search_text))>0
              or strpos(lower(j.payer_name),lower(search_text))>0 or strpos(lower(j.invoice_number),lower(search_text))>0)
        )
      )
    ))
  order by a.movement_date desc,a.recorded_at desc,a.id desc limit greatest(1,least(row_limit,101))
$$;
revoke all on function app.finance_ledger_page(date,text,text,date,timestamptz,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function app.finance_ledger_page(date,text,text,date,timestamptz,uuid,integer) to app_runtime;
