alter table app.invoice add column billing_class_id uuid references app.school_class;
create index invoice_billing_class_idx on app.invoice(billing_class_id,period,issued_at);

create function app.invoice_billing_class(pupil uuid,billed_month date) returns uuid
language sql stable set search_path=pg_catalog
as $$
  select e.class_id from app.enrollment e join app.school_year y on y.id=e.year_id and y.state in ('active','closed')
  where e.student_id=pupil and e.voided_at is null
    and e.effective_from<billed_month+interval '1 month' and e.effective_until>billed_month
  order by greatest(e.effective_from,billed_month),e.effective_from desc,e.id limit 1
$$;
update app.invoice j set billing_class_id=app.invoice_billing_class(j.student_id,j.period);

create function app.snapshot_invoice_billing_class() returns trigger
language plpgsql set search_path=pg_catalog
as $$
begin
  new.billing_class_id:=app.invoice_billing_class(new.student_id,new.period);
  return new;
end
$$;
create trigger invoice_billing_class_before_insert before insert on app.invoice
for each row execute function app.snapshot_invoice_billing_class();

create function app.finance_report_scope() returns text
language sql stable set search_path=pg_catalog
as $$
  select case when app.finance_receipt_staff() then 'staff' when app.actor_persona()='guardian' then 'payer' end
$$;

create function app.finance_reporting_clock(on_date date,snapshot timestamptz)
returns table(school_date date,as_of date,cutoff timestamptz,scope text,can_export boolean)
language sql stable security definer set search_path=pg_catalog
as $$
  select app.school_today(),coalesce(on_date,app.school_today()),
    least(statement_timestamp(),((coalesce(on_date,app.school_today())+1)::timestamp at time zone s.timezone),snapshot),
    a.scope,a.scope='staff' and app.has_capability('finance.export')
  from app.school_settings s cross join lateral (select app.finance_report_scope() as scope) a
  where s.singleton and a.scope is not null and (on_date is null or on_date<=app.school_today())
$$;

create function app.finance_report_classes(month_key date)
returns table(id uuid,code text,name_ar text,name_de text,year_start date,year_end date)
language sql stable security definer set search_path=pg_catalog
as $$
  select c.id,c.code,c.name_ar,c.name_de,y.starts_on,y.ends_exclusive
  from app.school_class c join app.school_year y on y.id=c.year_id
  where app.finance_report_scope()='staff' and y.state in ('active','closed')
    and (month_key is null or y.starts_on<month_key+interval '1 month' and y.ends_exclusive>month_key)
  order by y.starts_on desc,c.code,c.id
$$;

create function app.finance_report_invoices(cutoff timestamptz,day_key date,month_key date,class_key uuid,pupil uuid,status_key text)
returns table(id uuid,student_id uuid,student_name text,student_number text,payer_id uuid,payer_name text,period date,
  class_id uuid,invoice_number text,due_date date,currency text,issued_at timestamptz,total_minor bigint,
  collectible_minor bigint,allocated_minor bigint,balance_minor bigint,state text,overdue boolean)
language sql stable set search_path=pg_catalog
as $$
  with priced as (
    select j.*,app.invoice_collectible_minor(j.id,cutoff) as collectible,app.invoice_net_allocated(j.id,cutoff) as paid
    from app.invoice j
    where j.issued_at<cutoff and (month_key is null or j.period=month_key)
      and (class_key is null or j.billing_class_id=class_key) and (pupil is null or j.student_id=pupil)
      and (app.finance_report_scope()='staff' or app.finance_report_scope()='payer' and j.payer_account_id=app.actor_account())
  ), balanced as (
    select j.*,greatest(0,j.collectible-j.paid) as balance,
      case when j.cancelled_at<cutoff then 'cancelled'
        when j.paid>=j.collectible then 'paid' when j.paid>0 then 'partial' else 'unpaid' end as state
    from priced j
  )
  select j.id,j.student_id,j.student_name,j.student_number,j.payer_account_id,j.payer_name,j.period,j.billing_class_id,j.invoice_number,
    j.due_date,j.currency::text,j.issued_at,j.total_minor,j.collectible,j.paid,j.balance,j.state,j.balance>0 and j.due_date<day_key
  from balanced j where status_key is null or j.state=status_key or status_key='overdue' and j.balance>0 and j.due_date<day_key
$$;

-- Outward refunds are introduced with the stop-review journal in B05.
create function app.finance_refunded_minor(target uuid,cutoff timestamptz) returns bigint
language sql stable set search_path=pg_catalog
as $$ select 0::bigint $$;

create function app.finance_report_summary(cutoff timestamptz,day_key date,month_key date,class_key uuid,pupil uuid,status_key text,
  received_from date,received_through date)
returns table(currency text,billed_minor bigint,collectible_minor bigint,applied_minor bigint,outstanding_minor bigint,
  overdue_minor bigint,invoice_count bigint,overdue_count bigint,received_minor bigint,net_received_minor bigint,
  matched_received_minor bigint,reversed_minor bigint,voided_minor bigint,refunded_minor bigint,unmatched_minor bigint,
  receipt_count bigint,matching_count bigint)
language sql stable security definer set search_path=pg_catalog
as $$
  with invoices as materialized (
    select * from app.finance_report_invoices(cutoff,day_key,month_key,class_key,pupil,status_key)
  ), billed as (
    select j.currency,sum(j.total_minor)::bigint as billed,sum(j.collectible_minor)::bigint as collectible,
      sum(j.allocated_minor)::bigint as applied,sum(j.balance_minor)::bigint as outstanding,
      coalesce(sum(j.balance_minor) filter(where j.overdue),0)::bigint as overdue,count(*) as invoice_count,
      count(*) filter(where j.overdue) as overdue_count
    from invoices j group by j.currency
  ), scoped_collections as (
    select r.id,r.currency,
      sum(a.amount_minor)::bigint as credited,
      coalesce(sum(a.amount_minor) filter(where q.id is not null),0)::bigint as reversed
    from invoices j join app.receipt_allocation a on a.invoice_id=j.id
    join app.finance_receipt r on r.id=a.receipt_id
    join app.receipt_posting p on p.id=a.posting_id and p.posted_at<cutoff
    left join app.receipt_reversal x on x.allocation_id=a.id
    left join app.receipt_posting q on q.id=x.posting_id and q.posted_at<cutoff
    where (received_from is null or r.received_date>=received_from) and (received_through is null or r.received_date<=received_through)
    group by r.id,r.currency
  ), school_collections as (
    select r.id,r.currency,r.amount_minor,m.active_minor,m.applied_minor,m.remainder_minor,m.voided,
      app.finance_refunded_minor(r.id,cutoff) as refunded
    from app.finance_receipt r cross join lateral app.receipt_money(r.id,cutoff) m
    where app.finance_report_scope()='staff' and class_key is null and pupil is null
      and (received_from is null or r.received_date>=received_from) and (received_through is null or r.received_date<=received_through)
  ), collected as (
    select r.currency::text as currency,sum(r.amount_minor)::bigint as received,
      sum(r.active_minor-r.refunded)::bigint as net_received,sum(r.amount_minor-r.active_minor)::bigint as voided,
      sum(r.refunded)::bigint as refunded,sum(r.remainder_minor-r.refunded)::bigint as unmatched,
      count(*) as receipt_count,count(*) filter(where r.remainder_minor>r.refunded) as matching_count
    from school_collections r group by r.currency
  ), matched as (
    select r.currency::text as currency,sum(r.credited-r.reversed)::bigint as applied,sum(r.reversed)::bigint as reversed,
      count(*) as receipt_count from scoped_collections r group by r.currency
  ), units as (
    select b.currency from billed b union select c.currency from collected c union select m.currency from matched m
  )
  select u.currency,coalesce(b.billed,0),coalesce(b.collectible,0),coalesce(b.applied,0),coalesce(b.outstanding,0),
    coalesce(b.overdue,0),coalesce(b.invoice_count,0),coalesce(b.overdue_count,0),
    case when app.finance_report_scope()='staff' and class_key is null and pupil is null then coalesce(c.received,0) end,
    case when app.finance_report_scope()='staff' and class_key is null and pupil is null then coalesce(c.net_received,0) end,
    coalesce(m.applied,0),coalesce(m.reversed,0),c.voided,c.refunded,c.unmatched,
    coalesce(c.receipt_count,m.receipt_count,0),c.matching_count
  from units u left join billed b on b.currency=u.currency left join collected c on c.currency=u.currency
  left join matched m on m.currency=u.currency
  where app.finance_report_scope() is not null order by u.currency
$$;

create function app.finance_report_lines(cutoff timestamptz,day_key date,month_key date,class_key uuid,pupil uuid,status_key text,
  received_from date,received_through date,after_at timestamptz,after_kind text,after_id uuid,row_limit integer)
returns table(id uuid,kind text,occurred_at timestamptz,invoice_id uuid,invoice_number text,student_id uuid,student_name text,
  student_number text,period date,payer_name text,class_code text,due_date date,receipt_id uuid,receipt_number text,
  received_date date,currency text,amount_minor bigint,balance_minor bigint,state text)
language sql stable security definer set search_path=pg_catalog
as $$
  with invoices as materialized (
    select * from app.finance_report_invoices(cutoff,day_key,month_key,class_key,pupil,status_key)
  ), scoped_allocations as materialized (
    select a.id as allocation_id,a.amount_minor,j.*,p.posted_at,r.received_date,
      case when app.finance_report_scope()='payer' then own.id else r.id end as receipt_id,
      case when app.finance_report_scope()='payer' then own.receipt_number else r.receipt_number end as receipt_number,
      q.id as reversal_id,q.posted_at as reversed_at
    from invoices j join app.receipt_allocation a on a.invoice_id=j.id
    join app.receipt_posting p on p.id=a.posting_id and p.posted_at<cutoff
    join app.finance_receipt r on r.id=a.receipt_id
    left join app.payer_receipt own on own.receipt_id=r.id and own.payer_id=j.payer_id
    left join app.receipt_reversal x on x.allocation_id=a.id
    left join app.receipt_posting q on q.id=x.posting_id and q.posted_at<cutoff
    where (received_from is null or r.received_date>=received_from) and (received_through is null or r.received_date<=received_through)
  ), report(id,kind,occurred_at,invoice_id,invoice_number,student_id,student_name,student_number,period,payer_name,class_code,
    due_date,receipt_id,receipt_number,received_date,currency,amount_minor,balance_minor,state) as (
    select j.id,'invoice'::text,j.issued_at,j.id,j.invoice_number,j.student_id,j.student_name,j.student_number,j.period,j.payer_name,
      case when app.finance_report_scope()='staff' then class.code end,j.due_date,null::uuid,null::text,null::date,j.currency,j.collectible_minor,j.balance_minor,
      case when j.overdue then 'overdue' else j.state end
    from invoices j left join app.school_class class on class.id=j.class_id
    union all
    select a.allocation_id,'allocation',a.posted_at,a.id,a.invoice_number,a.student_id,a.student_name,a.student_number,a.period,a.payer_name,
      case when app.finance_report_scope()='staff' then class.code end,a.due_date,a.receipt_id,a.receipt_number,a.received_date,a.currency,a.amount_minor,a.balance_minor,
      case when a.overdue then 'overdue' else a.state end
    from scoped_allocations a left join app.school_class class on class.id=a.class_id
    union all
    select a.allocation_id,'reversal',a.reversed_at,a.id,a.invoice_number,a.student_id,a.student_name,a.student_number,a.period,a.payer_name,
      case when app.finance_report_scope()='staff' then class.code end,a.due_date,a.receipt_id,a.receipt_number,a.received_date,a.currency,a.amount_minor,a.balance_minor,
      case when a.overdue then 'overdue' else a.state end
    from scoped_allocations a left join app.school_class class on class.id=a.class_id where a.reversal_id is not null
    union all
    select p.id,p.kind,p.posted_at,null,null,null,null,null,null,null,null,null,r.id,r.receipt_number,r.received_date,r.currency::text,
      r.amount_minor,m.remainder_minor-app.finance_refunded_minor(r.id,cutoff),
      case when m.voided then 'voided' when m.remainder_minor>app.finance_refunded_minor(r.id,cutoff) then 'needs_matching' else 'allocated' end
    from app.finance_receipt r join app.receipt_posting p on p.receipt_id=r.id and p.kind in ('record','void_receipt') and p.posted_at<cutoff
    cross join lateral app.receipt_money(r.id,cutoff) m
    where app.finance_report_scope()='staff' and month_key is null and class_key is null and pupil is null and status_key is null
      and (received_from is null or r.received_date>=received_from) and (received_through is null or r.received_date<=received_through)
  )
  select row.* from report row
  where app.finance_report_scope() is not null and (after_id is null or (row.occurred_at,row.kind,row.id)<(after_at,after_kind,after_id))
  order by row.occurred_at desc,row.kind desc,row.id desc limit greatest(1,least(row_limit,25001))
$$;

insert into app.audit_action_rule(action,resource_kind,change_category,allowed_capabilities,link_kind)
values ('finance.statement_exported','finance','export',array['finance.export','finance.read'],null);

revoke all on function app.invoice_billing_class(uuid,date),app.snapshot_invoice_billing_class(),app.finance_report_scope(),
  app.finance_reporting_clock(date,timestamptz),app.finance_report_classes(date),
  app.finance_report_invoices(timestamptz,date,date,uuid,uuid,text),app.finance_refunded_minor(uuid,timestamptz),
  app.finance_report_summary(timestamptz,date,date,uuid,uuid,text,date,date),
  app.finance_report_lines(timestamptz,date,date,uuid,uuid,text,date,date,timestamptz,text,uuid,integer)
from public,anon,authenticated,service_role;
grant execute on function app.finance_reporting_clock(date,timestamptz),app.finance_report_classes(date),
  app.finance_report_summary(timestamptz,date,date,uuid,uuid,text,date,date),
  app.finance_report_lines(timestamptz,date,date,uuid,uuid,text,date,date,timestamptz,text,uuid,integer)
to app_runtime;
