set local search_path = pg_catalog, public, extensions;

create table app.room (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9][A-Z0-9_-]{0,23}$'),
  name_ar text not null check (char_length(name_ar) between 1 and 120),
  name_de text not null check (char_length(name_de) between 1 and 120),
  revision integer not null default 1 check (revision >= 1)
);

create table app.weekly_slot (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references app.teaching_assignment,
  year_id uuid not null,
  class_id uuid not null,
  offering_id uuid not null,
  staff_id uuid not null references app.staff_profile,
  room_id uuid not null references app.room,
  weekday smallint not null check (weekday between 1 and 7),
  starts_minute int not null check (starts_minute between 0 and 1439),
  ends_minute int not null check (ends_minute between 1 and 1440),
  effective_from date not null,
  effective_until date not null,
  canceled_at timestamptz,
  revision integer not null default 1 check (revision >= 1),
  foreign key (class_id,year_id) references app.school_class(id,year_id),
  foreign key (offering_id,class_id) references app.class_subject(id,class_id),
  check (effective_from < effective_until and starts_minute < ends_minute),
  exclude using gist (
    class_id with =, weekday with =, daterange(effective_from,effective_until,'[)') with &&,
    int4range(starts_minute,ends_minute,'[)') with &&
  ) where (canceled_at is null),
  exclude using gist (
    room_id with =, weekday with =, daterange(effective_from,effective_until,'[)') with &&,
    int4range(starts_minute,ends_minute,'[)') with &&
  ) where (canceled_at is null)
);
create index weekly_slot_year_idx on app.weekly_slot(year_id,weekday) where canceled_at is null;
create index weekly_slot_assignment_idx on app.weekly_slot(assignment_id) where canceled_at is null;

create table app.weekly_slot_staff (
  slot_id uuid not null references app.weekly_slot on delete cascade,
  staff_id uuid not null references app.staff_profile,
  weekday smallint not null,
  effective_dates daterange not null,
  lesson_minutes int4range not null,
  primary key (slot_id,staff_id,effective_dates),
  exclude using gist (staff_id with =, weekday with =, effective_dates with &&, lesson_minutes with &&)
);

create function app.guard_weekly_slot() returns trigger
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  source app.teaching_assignment%rowtype;
  target_year app.school_year%rowtype;
begin
  perform app.lock_school_calendar();
  if new.canceled_at is not null then return new; end if;
  select * into source from app.teaching_assignment where id = new.assignment_id;
  if not found or source.offering_id is null then
    raise exception 'Lesson requires a subject assignment' using errcode = '23514';
  end if;
  select y.* into target_year from app.school_year y join app.school_class c on c.year_id = y.id where c.id = source.class_id;
  new.year_id := target_year.id;
  new.class_id := source.class_id;
  new.offering_id := source.offering_id;
  new.staff_id := source.staff_id;
  if new.effective_from + ((new.weekday - extract(isodow from new.effective_from)::int + 7) % 7) >= new.effective_until
    or new.effective_from < target_year.starts_on or new.effective_until > target_year.ends_exclusive
    or new.effective_from < source.effective_from
    or new.effective_until > source.effective_until then
    raise exception 'Lesson interval outside assignment or school year' using errcode = '23514';
  end if;
  -- Preserve earlier occurrences when an assignment is revoked before its scheduled end.
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1 and new.effective_until <= app.school_today()
    and old.assignment_id = new.assignment_id and old.effective_from = new.effective_from
    and old.room_id = new.room_id and old.weekday = new.weekday
    and old.starts_minute = new.starts_minute and old.ends_minute = new.ends_minute then
    return new;
  end if;
  if target_year.state = 'closed' or source.revoked_at is not null
    or not app.staff_assignable(source.staff_id,new.effective_from,new.effective_until) then
    raise exception 'Inactive subject assignment' using errcode = '23514';
  end if;
  return new;
end
$$;
create trigger guard_weekly_slot before insert or update on app.weekly_slot
for each row execute function app.guard_weekly_slot();

create function app.rebuild_slot_staff(target uuid) returns void
language plpgsql security definer set search_path = pg_catalog
as $$
begin
  delete from app.weekly_slot_staff where slot_id = target;
  insert into app.weekly_slot_staff (slot_id,staff_id,weekday,effective_dates,lesson_minutes)
  select l.id,l.staff_id,l.weekday,daterange(l.effective_from,l.effective_until,'[)'),int4range(l.starts_minute,l.ends_minute,'[)')
  from app.weekly_slot l where l.id = target and l.canceled_at is null
  union all
  select l.id,d.staff_id,l.weekday,
    daterange(l.effective_from,l.effective_until,'[)') * daterange(d.effective_from,d.effective_until,'[)'),
    int4range(l.starts_minute,l.ends_minute,'[)')
  from app.weekly_slot l join app.substitute_assignment d on d.assignment_id = l.assignment_id
  where l.id = target and l.canceled_at is null and d.revoked_at is null and 'academics.log' = any(d.capabilities)
    and daterange(l.effective_from,l.effective_until,'[)') && daterange(d.effective_from,d.effective_until,'[)');
end
$$;

create function app.index_slot_staff() returns trigger
language plpgsql security definer set search_path = pg_catalog
as $$
begin
  perform app.rebuild_slot_staff(new.id);
  return new;
end
$$;
create trigger index_slot_staff after insert or update on app.weekly_slot
for each row execute function app.index_slot_staff();

create function app.refresh_substitute_slots() returns trigger
language plpgsql security definer set search_path = pg_catalog
as $$
declare target uuid;
begin
  perform app.lock_school_calendar();
  for target in select l.id from app.weekly_slot l where l.assignment_id = new.assignment_id and l.canceled_at is null order by l.id
  loop
    perform app.rebuild_slot_staff(target);
  end loop;
  return new;
end
$$;
create trigger refresh_substitute_slots after insert or update on app.substitute_assignment
for each row execute function app.refresh_substitute_slots();

create function app.trim_assignment_slots() returns trigger
language plpgsql security definer set search_path = pg_catalog
as $$
declare cutoff date := new.effective_until;
begin
  if new.revoked_at is not null and old.revoked_at is null then
    cutoff := least(cutoff,coalesce(app.school_today(),cutoff));
  end if;
  if cutoff >= old.effective_until then return new; end if;
  update app.weekly_slot set canceled_at = now(), revision = revision + 1
    where assignment_id = new.id and canceled_at is null
      and effective_from + ((weekday - extract(isodow from effective_from)::int + 7) % 7) >= cutoff;
  update app.weekly_slot set effective_until = cutoff, revision = revision + 1
    where assignment_id = new.id and canceled_at is null and effective_until > cutoff and effective_from < cutoff;
  return new;
end
$$;
create trigger trim_assignment_slots after update of effective_until,revoked_at on app.teaching_assignment
for each row execute function app.trim_assignment_slots();

create function app.year_timetable_bounds() returns trigger
language plpgsql security definer set search_path = pg_catalog
as $$
begin
  perform app.lock_school_calendar();
  if exists(select 1 from app.weekly_slot l where l.year_id = new.id and l.canceled_at is null
    and (l.effective_from < new.starts_on or l.effective_until > new.ends_exclusive)) then
    raise exception 'School year excludes scheduled lessons' using errcode = '23514';
  end if;
  return new;
end
$$;
create trigger year_timetable_bounds before update of starts_on,ends_exclusive on app.school_year
for each row execute function app.year_timetable_bounds();

alter table app.room enable row level security;
alter table app.weekly_slot enable row level security;
alter table app.weekly_slot_staff enable row level security;
grant select,insert,update on app.room,app.weekly_slot to app_runtime;
create policy room_editor on app.room for all to app_runtime using ((select app.staff_editor())) with check ((select app.staff_editor()));
create policy timetable_editor on app.weekly_slot for all to app_runtime using ((select app.staff_editor())) with check ((select app.staff_editor()));

create function app.timetable_teachers(target_year uuid)
returns table(slot_id uuid,staff_id uuid,weekday smallint,starts_minute int,ends_minute int,starts_on date,ends_exclusive date)
language sql stable security definer set search_path = pg_catalog
as $$
  select s.slot_id,s.staff_id,s.weekday,lower(s.lesson_minutes),upper(s.lesson_minutes),lower(s.effective_dates),upper(s.effective_dates)
  from app.weekly_slot_staff s join app.weekly_slot l on l.id = s.slot_id
  where app.staff_editor() and l.year_id = target_year
$$;

create function app.timetable_week(begins date, target_class uuid, target_child uuid)
returns table (
  slot_id uuid, assignment_id uuid, class_id uuid, class_code text, class_name_ar text, class_name_de text,
  subject_name_ar text, subject_name_de text, room_code text, room_name_ar text, room_name_de text,
  teacher_name text, substitute boolean, local_date date, starts_minute integer, ends_minute integer,
  teaching boolean, revision integer
)
language sql stable security definer set search_path = pg_catalog
as $$
  with dates as (select begins + offset_day as day from generate_series(0,6) days(offset_day)),
  visible as (
    select l.*,d.day, t.revoked_at as source_revoked
    from app.weekly_slot l join dates d on extract(isodow from d.day) = l.weekday
    join app.teaching_assignment t on t.id = l.assignment_id
    where l.canceled_at is null and d.day >= l.effective_from and d.day < l.effective_until
      and (target_class is null or l.class_id = target_class)
  )
  select l.id,l.assignment_id,c.id,c.code,c.name_ar,c.name_de,s.name_ar,s.name_de,r.code,r.name_ar,r.name_de,
    coalesce(delegate.display_name,p.display_name),delegate.id is not null,l.day,l.starts_minute,l.ends_minute,
    app.is_teaching_day(c.id,l.day),l.revision
  from visible l join app.school_class c on c.id = l.class_id join app.class_subject o on o.id = l.offering_id
  join app.subject s on s.id = o.subject_id join app.room r on r.id = l.room_id join app.staff_profile p on p.id = l.staff_id
  left join lateral (
    select q.id,q.account_id,q.display_name,d.effective_until
    from app.substitute_assignment d join app.staff_profile q on q.id = d.staff_id join app.account a on a.id = q.account_id
    where d.assignment_id = l.assignment_id and l.day >= d.effective_from and l.day < d.effective_until
      and d.revoked_at is null and 'academics.log' = any(d.capabilities)
      and app.profile_active_at(q,l.day) and a.status = 'active' and 'teacher' = any(app.active_personas(a.id))
    limit 1
  ) delegate on true
  where
    (app.staff_editor() and target_child is null)
    or (app.actor_persona() = 'teacher' and target_child is null and l.source_revoked is null and (
      (p.account_id = app.actor_account() and app.profile_active_at(p,app.school_today()))
      or (delegate.account_id = app.actor_account() and delegate.effective_until > app.school_today())
    ))
    or (app.actor_persona() = 'guardian' and target_child is not null and app.has_child_link(target_child) and exists (
      select 1 from app.enrollment e where e.student_id = target_child and e.class_id = l.class_id
        and e.voided_at is null and l.day >= e.effective_from and l.day < e.effective_until
    ))
  order by l.day,l.starts_minute,c.code,l.id
$$;

create function app.timetable_days(begins date, target_class uuid, target_child uuid)
returns table(local_date date, teaching boolean)
language sql stable security definer set search_path = pg_catalog
as $$
  with dates as (select begins + offset_day as day from generate_series(0,6) days(offset_day))
  select d.day, app.is_teaching_day(coalesce(target_class,(
    select e.class_id from app.enrollment e
    where target_child is not null and app.has_child_link(target_child) and e.student_id = target_child
      and e.voided_at is null and d.day >= e.effective_from and d.day < e.effective_until
  )),d.day)
  from dates d
  where (target_class is null or app.staff_editor()) and (target_child is null or app.has_child_link(target_child))
  order by d.day
$$;

create function app.timetable_week_info(requested date)
returns table(week_of date, timezone text)
language sql stable security definer set search_path = pg_catalog
as $$
  select date_trunc('week',coalesce(requested,app.school_today())::timestamp)::date,s.timezone
  from app.school_settings s where s.singleton and app.actor_account() is not null
$$;

revoke all on function app.timetable_week_info(date) from public,anon,authenticated,service_role;
grant execute on function app.timetable_week_info(date) to app_runtime;

revoke all on function app.guard_weekly_slot(),app.rebuild_slot_staff(uuid),app.index_slot_staff(),
  app.refresh_substitute_slots(),app.trim_assignment_slots(),app.year_timetable_bounds(),app.timetable_teachers(uuid),
  app.timetable_week(date,uuid,uuid),app.timetable_days(date,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function app.timetable_teachers(uuid),app.timetable_week(date,uuid,uuid),app.timetable_days(date,uuid,uuid) to app_runtime;
