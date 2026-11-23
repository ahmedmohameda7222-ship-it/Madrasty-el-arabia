-- Klassenlehrkraft leads the entire class, across all subjects offered there.
-- Fachlehrkräfte remain limited to their own offering. This preserves
-- attendance ownership exclusively for primary assignments.
set local search_path=pg_catalog,public,extensions;

create or replace function app.teacher_scope(
  target_class uuid,local_day date,action text,offering uuid default null
) returns boolean
language sql stable security definer set search_path=pg_catalog
as $$
  select app.actor_persona()='teacher' and exists (
    select 1 from app.teaching_assignment t
    join app.staff_profile p on p.account_id=app.actor_account()
    where t.class_id=target_class
      and app.profile_active_at(p,local_day)
      and app.profile_active_at(p,app.school_today())
      and (
        offering is null
        or t.offering_id=offering
        or (t.kind='primary' and t.offering_id is null and exists(
          select 1 from app.class_subject o
          where o.id=offering and o.class_id=t.class_id
        ))
      )
      and (action not in ('attendance.mark','attendance.approve') or t.kind='primary')
      and app.teacher_applies(t.id,p.id,local_day,action)
      and app.teacher_applies(t.id,p.id,app.school_today(),action)
  )
$$;
