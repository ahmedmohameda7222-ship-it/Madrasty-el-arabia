set local search_path = pg_catalog, public, extensions;

create table app.staff_profile (
  id uuid primary key default gen_random_uuid(),
  account_id uuid unique references app.account,
  display_name text not null check (char_length(display_name) between 1 and 200),
  role text not null check (role in ('teacher','principal','deputy','office')),
  title_ar text not null check (char_length(title_ar) between 1 and 120),
  title_de text not null check (char_length(title_de) between 1 and 120),
  work_email text check (char_length(work_email) <= 254),
  work_phone text check (char_length(work_phone) <= 48),
  active_from date not null,
  active_until date,
  disabled_at timestamptz,
  revision integer not null default 1 check (revision >= 1),
  check (active_until is null or active_until > active_from)
);

create table app.subject (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z][A-Z0-9_]{1,23}$'),
  name_ar text not null,
  name_de text not null,
  revision integer not null default 1 check (revision >= 1)
);

insert into app.subject (code, name_ar, name_de) values
  ('FIQH', 'الفقه', 'Fiqh'), ('SEERAH', 'السيرة', 'Sira'), ('HADITH', 'الحديث', 'Hadith');

create table app.class_subject (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references app.school_class,
  subject_id uuid not null references app.subject,
  unique (class_id, subject_id),
  unique (id, class_id)
);

create function app.valid_assignment_caps(input text[]) returns boolean
language sql immutable set search_path = pg_catalog
as $$
  select cardinality(input) between 1 and 8
    and input <@ array['attendance.read', 'attendance.mark', 'attendance.approve', 'academics.plan', 'academics.log', 'academics.grade', 'academics.publish', 'comms.class']::text[]
    and cardinality(input) = (select count(distinct entry) from unnest(input) items(entry))
$$;

create table app.teaching_assignment (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references app.school_class,
  offering_id uuid,
  staff_id uuid not null references app.staff_profile,
  kind text not null check (kind in ('primary','subject')),
  effective_from date not null,
  effective_until date not null,
  capabilities text[] not null check (app.valid_assignment_caps(capabilities)),
  revoked_at timestamptz,
  revision integer not null default 1 check (revision >= 1),
  foreign key (offering_id, class_id) references app.class_subject(id, class_id),
  check (effective_until > effective_from),
  check ((kind = 'primary') = (offering_id is null)),
  check (kind <> 'subject' or not (capabilities && array['attendance.mark','attendance.approve']::text[])),
  exclude using gist (class_id with =, daterange(effective_from, effective_until, '[)') with &&)
    where (kind = 'primary' and revoked_at is null),
  exclude using gist (offering_id with =, staff_id with =, daterange(effective_from, effective_until, '[)') with &&)
    where (kind = 'subject' and revoked_at is null)
);

create table app.substitute_assignment (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references app.teaching_assignment,
  staff_id uuid not null references app.staff_profile,
  effective_from date not null,
  effective_until date not null,
  capabilities text[] not null check (app.valid_assignment_caps(capabilities)),
  revoked_at timestamptz,
  revision integer not null default 1 check (revision >= 1),
  check (effective_until > effective_from),
  exclude using gist (assignment_id with =, daterange(effective_from, effective_until, '[)') with &&)
    where (revoked_at is null)
);

create function app.school_today() returns date
language sql stable security definer set search_path = pg_catalog
as $$ select (now() at time zone timezone)::date from app.school_settings where singleton $$;

create function app.profile_active_at(profile app.staff_profile, day date) returns boolean
language sql stable set search_path = pg_catalog
as $$
  select profile.disabled_at is null and day >= profile.active_from
    and (profile.active_until is null or day < profile.active_until)
$$;

create function app.staff_editor() returns boolean
language sql stable set search_path = pg_catalog
as $$ select app.has_capability('school.manage') or app.has_capability('academics.supervise') $$;

create function app.staff_assignable(ref uuid, begin_day date, end_day date) returns boolean
language sql stable security definer set search_path = pg_catalog
as $$
  select exists(
    select 1 from app.staff_profile p join app.account a on a.id = p.account_id
    where p.id = ref and app.profile_active_at(p,begin_day)
      and (p.active_until is null or p.active_until >= end_day) and a.status = 'active'
      and 'teacher' = any(app.active_personas(a.id))
  )
$$;

create function app.guard_assignment() returns trigger
language plpgsql security definer set search_path = pg_catalog
as $$
begin
  perform app.lock_school_calendar();
  perform app.lock_classes(new.class_id);
  if new.revoked_at is not null then return new; end if;
  if not exists(select 1 from app.school_class c join app.school_year y on y.id = c.year_id
      where c.id = new.class_id and new.effective_from >= y.starts_on
        and new.effective_until <= y.ends_exclusive and y.state <> 'closed')
    or not app.staff_assignable(new.staff_id,new.effective_from,new.effective_until)
  then raise exception 'Assignment outside allowable date range' using errcode = '23514'; end if;
  if tg_op = 'UPDATE' and exists(select 1 from app.substitute_assignment s where s.assignment_id = old.id
    and s.revoked_at is null and (s.effective_from < new.effective_from or s.effective_until > new.effective_until
      or not s.capabilities <@ new.capabilities))
  then raise exception 'Existing substitute outside updated assignment' using errcode = '23514'; end if;
  return new;
end
$$;
create trigger guard_assignment before insert or update on app.teaching_assignment
for each row execute function app.guard_assignment();

create function app.guard_substitute() returns trigger
language plpgsql security definer set search_path = pg_catalog
as $$
declare source app.teaching_assignment%rowtype;
begin
  perform app.lock_school_calendar();
  if new.revoked_at is not null then return new; end if;
  select * into source from app.teaching_assignment where id = new.assignment_id for share;
  if not found or source.revoked_at is not null or source.staff_id = new.staff_id
    or new.effective_from < source.effective_from or new.effective_until > source.effective_until
    or not new.capabilities <@ source.capabilities
    or not app.staff_assignable(new.staff_id,new.effective_from,new.effective_until)
  then raise exception 'Invalid substitute period or permissions' using errcode = '23514'; end if;
  return new;
end
$$;
create trigger guard_substitute before insert or update on app.substitute_assignment
for each row execute function app.guard_substitute();

create function app.teacher_applies(
  tid uuid, acting_staff uuid, school_day date, needed text default null
) returns boolean
language sql stable security definer set search_path = pg_catalog
as $$
  select exists(
    select 1 from app.teaching_assignment t
    where t.id = tid and t.revoked_at is null and school_day >= t.effective_from and school_day < t.effective_until
      and (
        (t.staff_id = acting_staff and (needed is null or needed = any(t.capabilities)))
        or exists (select 1 from app.substitute_assignment d where d.assignment_id = t.id
          and d.staff_id = acting_staff and d.revoked_at is null and school_day >= d.effective_from
          and school_day < d.effective_until and (needed is null or needed = any(d.capabilities)))
      )
  )
$$;

create function app.teacher_scope(
  target_class uuid, local_day date, action text, offering uuid default null
) returns boolean
language sql stable security definer set search_path = pg_catalog
as $$
  select app.actor_persona() = 'teacher' and exists (
    select 1 from app.teaching_assignment t join app.staff_profile p on p.account_id = app.actor_account()
    where t.class_id = target_class and app.profile_active_at(p,local_day)
      and app.profile_active_at(p,app.school_today())
      and (offering is null or t.offering_id = offering)
      and (action not in ('attendance.mark','attendance.approve') or t.kind = 'primary')
      and app.teacher_applies(t.id,p.id,local_day,action)
      and app.teacher_applies(t.id,p.id,app.school_today(),action)
  )
$$;

create function app.teacher_assignment_visible(target uuid) returns boolean
language sql stable security definer set search_path = pg_catalog
as $$
  select app.actor_persona() = 'teacher' and exists (
    select 1 from app.staff_profile p where p.account_id = app.actor_account() and app.profile_active_at(p,app.school_today())
      and app.teacher_applies(target,p.id,app.school_today())
  )
$$;

create function app.staff_accounts() returns table(account_id uuid, display_name text, roles app.persona[])
language sql stable security definer set search_path = pg_catalog
as $$
  select a.id, coalesce(t.display_name, e.display_name, a.id::text), app.active_personas(a.id)
  from app.account a
  left join app.teacher_invite_contact t on t.account_id = a.id
  left join app.teacher_application e on e.applicant_id = a.id
  where app.staff_editor() and a.status = 'active'
    and ('teacher' = any(app.active_personas(a.id)) or 'admin' = any(app.active_personas(a.id)))
  order by a.id
$$;

create function app.staff_contact_candidates()
returns table (id uuid, account_id uuid, display_name text, role text, title_ar text, title_de text, work_email text, work_phone text)
language sql stable security definer set search_path = pg_catalog
as $$
  with today as (select app.school_today() as day),
  linked_classes as (
    select distinct e.class_id from app.enrollment e, today
    where e.voided_at is null and today.day >= e.effective_from and today.day < e.effective_until
      and app.has_child_link(e.student_id)
  )
  select p.id,p.account_id,p.display_name,p.role,p.title_ar,p.title_de,p.work_email,p.work_phone
  from app.staff_profile p join app.account a on a.id = p.account_id, today
  where a.status = 'active' and app.profile_active_at(p,today.day) and (
    (app.actor_persona() = 'admin' and (
      app.has_capability('school.manage') or app.has_capability('academics.supervise')
      or (p.role <> 'teacher' and (app.has_capability('students.manage') or app.has_capability('finance.read')))
    ))
    or (app.actor_persona() = 'teacher' and p.role <> 'teacher' and 'admin' = any(app.active_personas(a.id)))
    or (app.actor_persona() = 'guardian' and (
      (p.role <> 'teacher' and 'admin' = any(app.active_personas(a.id))) or (
        'teacher' = any(app.active_personas(a.id)) and exists(
          select 1 from app.teaching_assignment t join linked_classes c on c.class_id = t.class_id
          where app.teacher_applies(t.id,p.id,today.day))
      )
    ))
  )
  union all
  select g.id,g.account_id,g.display_name,'guardian','ولي أمر','Sorgeberechtigte',null,null
  from app.guardian_profile g join app.account a on a.id = g.account_id, today
  where app.actor_persona() = 'teacher' and a.status = 'active' and 'guardian' = any(app.active_personas(a.id))
    and exists (
      select 1 from app.child_link l join app.enrollment e on e.student_id = l.student_id
      where l.guardian_id = g.id and l.state = 'approved' and l.effective_from <= now()
        and (l.effective_until is null or l.effective_until > now()) and e.voided_at is null
        and today.day >= e.effective_from and today.day < e.effective_until
        and app.teacher_scope(e.class_id,today.day,'comms.class')
    )
$$;

create function app.end_teacher_assignments() returns trigger
language plpgsql security definer set search_path = pg_catalog
as $$
begin
  update app.teaching_assignment set revoked_at = new.revoked_at, revision = revision + 1
  where staff_id in (select id from app.staff_profile where account_id = new.account_id) and revoked_at is null;
  update app.substitute_assignment set revoked_at = new.revoked_at, revision = revision + 1
  where revoked_at is null and (staff_id in (select id from app.staff_profile where account_id = new.account_id)
    or assignment_id in (select t.id from app.teaching_assignment t join app.staff_profile p on p.id = t.staff_id
      where p.account_id = new.account_id and t.revoked_at is not null));
  return new;
end
$$;
create trigger end_teacher_assignments after update of revoked_at on app.persona_grant
for each row when (new.persona = 'teacher' and new.revoked_at is not null and old.revoked_at is null)
execute function app.end_teacher_assignments();

alter table app.staff_profile enable row level security;
alter table app.subject enable row level security;
alter table app.class_subject enable row level security;
alter table app.teaching_assignment enable row level security;
alter table app.substitute_assignment enable row level security;
grant select, insert, update on app.staff_profile, app.class_subject, app.teaching_assignment, app.substitute_assignment to app_runtime;
grant select on app.subject to app_runtime;

create policy staff_office on app.staff_profile for all to app_runtime using ((select app.staff_editor())) with check ((select app.staff_editor()));
create policy staff_self on app.staff_profile for select to app_runtime using (account_id = (select app.actor_account()));
create policy subject_lookup on app.subject for select to app_runtime using ((select app.staff_editor()) or (select app.actor_persona()) = 'teacher');
create policy offering_editor on app.class_subject for all to app_runtime using ((select app.staff_editor())) with check ((select app.staff_editor()));
create policy assignments_editor on app.teaching_assignment for all to app_runtime using ((select app.staff_editor())) with check ((select app.staff_editor()));
create policy own_assignment on app.teaching_assignment for select to app_runtime using (app.teacher_assignment_visible(id));
create policy substitutes_editor on app.substitute_assignment for all to app_runtime using ((select app.staff_editor())) with check ((select app.staff_editor()));
create policy year_teaching_office on app.school_year for select to app_runtime using ((select app.staff_editor()));
create policy class_teaching_office on app.school_class for select to app_runtime using ((select app.staff_editor()));

revoke all on function app.valid_assignment_caps(text[]), app.school_today(), app.profile_active_at(app.staff_profile,date),
  app.staff_editor(), app.staff_assignable(uuid,date,date), app.guard_assignment(), app.guard_substitute(),
  app.teacher_applies(uuid,uuid,date,text), app.teacher_scope(uuid,date,text,uuid), app.teacher_assignment_visible(uuid),
  app.staff_accounts(), app.staff_contact_candidates(), app.end_teacher_assignments()
from public, anon, authenticated, service_role;
grant execute on function app.valid_assignment_caps(text[]), app.school_today(), app.staff_editor(),
  app.teacher_scope(uuid,date,text,uuid), app.teacher_assignment_visible(uuid), app.staff_accounts(),
  app.staff_contact_candidates() to app_runtime;

create function app.guard_staff_profile() returns trigger
language plpgsql security definer set search_path = pg_catalog
as $$
begin
  perform app.lock_school_calendar();
  if old.account_id is not null and old.account_id is distinct from new.account_id then
    raise exception 'Staff account binding is immutable' using errcode = '23514';
  end if;
  if exists (
    select 1 from app.teaching_assignment t where t.staff_id = new.id and t.revoked_at is null
      and (t.effective_from < new.active_from or (new.active_until is not null and t.effective_until > new.active_until))
    union all
    select 1 from app.substitute_assignment t where t.staff_id = new.id and t.revoked_at is null
      and (t.effective_from < new.active_from or (new.active_until is not null and t.effective_until > new.active_until))
  ) then raise exception 'Active period excludes an assignment' using errcode = '23514'; end if;
  return new;
end
$$;
create trigger guard_staff_profile before update on app.staff_profile for each row execute function app.guard_staff_profile();
revoke all on function app.guard_staff_profile() from public, anon, authenticated, service_role;

create function app.teacher_overview()
returns table (id uuid, class_id uuid, offering_id uuid, staff_id uuid, kind text, effective_from date, effective_until date,
  capabilities text[], revision integer, staff_name text, class_code text, class_name_ar text, class_name_de text,
  subject_id uuid, subject_name_ar text, subject_name_de text, substitute boolean)
language sql stable security definer set search_path = pg_catalog
as $$
  select t.id,t.class_id,t.offering_id,p.id,t.kind,
    coalesce(d.effective_from,t.effective_from),coalesce(d.effective_until,t.effective_until),
    coalesce(d.capabilities,t.capabilities),t.revision,p.display_name,c.code,c.name_ar,c.name_de,
    s.id,s.name_ar,s.name_de,d.id is not null
  from app.teaching_assignment t
  join app.school_class c on c.id = t.class_id
  join app.staff_profile p on p.account_id = app.actor_account()
  left join app.class_subject u on u.id = t.offering_id
  left join app.subject s on s.id = u.subject_id
  left join app.substitute_assignment d on d.assignment_id = t.id and d.staff_id = p.id and d.revoked_at is null
    and app.school_today() >= d.effective_from and app.school_today() < d.effective_until
  where app.actor_persona() = 'teacher' and app.profile_active_at(p,app.school_today())
    and app.teacher_applies(t.id,p.id,app.school_today())
$$;
revoke all on function app.teacher_overview() from public, anon, authenticated, service_role;
grant execute on function app.teacher_overview() to app_runtime;
