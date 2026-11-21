create table app.account_preference (
  account_id uuid primary key references app.account,
  ui_locale text not null check (ui_locale in ('ar','de')),
  correspondence_locale text not null check (correspondence_locale in ('ar','de')),
  theme text not null check (theme in ('system','light','dark')),
  revision integer not null default 1 check (revision >= 1)
);

alter table app.account_preference enable row level security;
grant select, insert, update on app.account_preference to app_runtime;
create policy own_account_preferences on app.account_preference for all to app_runtime
  using (account_id = (select app.actor_account())) with check (account_id = (select app.actor_account()));

create function app.directory_contacts()
returns table (
  id text, account_id uuid, target_persona app.persona, role text, display_name text,
  title_ar text, title_de text, work_email text, work_phone text, contexts jsonb
)
language sql stable security definer set search_path = pg_catalog
as $$
  with today as (select app.school_today() as day),
  candidates as (
    select p.* from app.staff_contact_candidates() p
    union all
    select p.id,p.account_id,p.display_name,'guardian','ولي أمر','Sorgeberechtigte',null,null
    from app.guardian_profile p
    where app.actor_persona() = 'admin' and app.has_capability('students.manage')
      and 'guardian' = any(app.active_personas(p.account_id))
      and exists (
        select 1 from app.child_link l join app.student s on s.id = l.student_id
        where l.guardian_id = p.id and l.state = 'approved' and l.effective_from <= now()
          and (l.effective_until is null or now() < l.effective_until) and s.state = 'active'
      )
  ),
  eligible as (
    select p.*, case p.role when 'guardian' then 'guardian' when 'teacher' then 'teacher' else 'admin' end::app.persona as target_persona
    from candidates p
    where p.account_id <> app.actor_account()
  )
  select p.id::text,p.account_id,p.target_persona,p.role,p.display_name,p.title_ar,p.title_de,p.work_email,p.work_phone,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'nameAr', c.name_ar, 'nameDe', c.name_de) order by c.code, c.id)
      from app.school_class c
      where (app.actor_persona() = 'guardian' and p.target_persona = 'teacher' and exists(
        select 1 from app.enrollment e
        where e.class_id = c.id and e.voided_at is null and today.day >= e.effective_from and today.day < e.effective_until
          and app.has_child_link(e.student_id)
          and exists(select 1 from app.teaching_assignment t where t.class_id = c.id and app.teacher_applies(t.id,p.id,today.day))
      )) or (app.actor_persona() = 'teacher' and p.target_persona = 'guardian'
        and app.teacher_scope(c.id,today.day,'comms.class') and exists(
          select 1 from app.child_link l join app.enrollment e on e.student_id = l.student_id
          where l.guardian_id = p.id and l.state = 'approved' and l.effective_from <= now()
            and (l.effective_until is null or now() < l.effective_until) and e.class_id = c.id
            and e.voided_at is null and today.day >= e.effective_from and today.day < e.effective_until
        ))
    ),'[]'::jsonb)
  from eligible p join app.account a on a.id = p.account_id cross join today
  where a.status = 'active' and p.target_persona = any(app.active_personas(a.id))
  union all
  select o.code,null,null,'office',null,o.ar,o.de,null,null,'[]'::jsonb
  from (values ('student_affairs','شؤون الطلبة','Schulbüro'),('accounts','الحسابات','Buchhaltung')) o(code,ar,de)
  where app.actor_persona() is not null and exists (
    select 1 from app.inbox_grant g join app.account a on a.id = g.account_id
    where g.inbox = o.code and g.revoked_at is null and now() >= g.valid_from
      and (g.valid_until is null or now() < g.valid_until)
      and a.status = 'active' and 'admin' = any(app.active_personas(a.id))
  )
$$;

revoke all on function app.directory_contacts() from public, anon, authenticated, service_role;
grant execute on function app.directory_contacts() to app_runtime;
