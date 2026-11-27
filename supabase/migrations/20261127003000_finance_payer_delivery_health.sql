-- Read-only current-period billing readiness. Never alter Auth users or bypass the delivery guard.
-- Finance issue staff already have access to payer designation and pupil records.
create function app.finance_payer_delivery_health()
returns table(student_id uuid,student_name text,student_number text,reason text)
language sql stable security definer set search_path=pg_catalog
as $$
  with period as (
    select app.billing_school_month() as month_key
  ), candidates as (
    select s.id,s.display_name,s.student_number,p.month_key,g.account_id,
      coalesce(app.contact_account_active(g.account_id,'guardian'),false)
        and exists(select 1 from app.child_link l where l.student_id=s.id and l.guardian_id=g.id
          and l.state='approved' and l.effective_from<=now()
          and (l.effective_until is null or l.effective_until>now())) as payer_ready
    from app.student s cross join period p
    left join lateral (
      select v.guardian_id from app.fee_payer_version v
      where v.student_id=s.id and v.effective_month<=p.month_key
      order by v.effective_month desc,v.revision desc limit 1
    ) v on true
    left join app.guardian_profile g on g.id=v.guardian_id
    where app.has_capability('finance.issue')
      and app.billing_eligible(s.id,p.month_key,null)
  )
  select c.id,c.display_name,c.student_number,
    case when not c.payer_ready then 'payer_missing' else 'payer_unreachable' end
  from candidates c
  where (not c.payer_ready and not exists(
    select 1 from app.invoice j where j.student_id=c.id and j.period=c.month_key and j.kind='monthly'
  )) or (c.payer_ready and not coalesce(app.communication_guardian_current(c.account_id,c.id),false))
  order by c.display_name,c.id
$$;
revoke all on function app.finance_payer_delivery_health() from public,anon,authenticated,service_role,app_runtime;
grant execute on function app.finance_payer_delivery_health() to app_runtime;
