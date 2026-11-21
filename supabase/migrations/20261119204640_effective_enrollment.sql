create extension if not exists btree_gist with schema extensions;
set local search_path = pg_catalog, public, extensions;

create table app.school_class (
  id uuid primary key default gen_random_uuid(),
  year_id uuid not null references app.school_year,
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9_-]{0,23}$'),
  name_ar text not null check (char_length(name_ar) between 1 and 120),
  name_de text not null check (char_length(name_de) between 1 and 120),
  capacity integer check (capacity between 1 and 1000),
  revision integer not null default 1 check (revision >= 1),
  unique (year_id, code),
  unique (id, year_id)
);

alter table app.day_exception drop constraint day_exception_class_pending;
alter table app.day_exception add constraint day_exception_class_year
  foreign key (class_id, year_id) references app.school_class(id, year_id);

create table app.enrollment (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references app.student,
  class_id uuid not null,
  year_id uuid not null,
  effective_from date not null,
  effective_until date not null,
  ending_reason text check (ending_reason is null or char_length(ending_reason) between 1 and 400),
  voided_at timestamptz,
  revision integer not null default 1 check (revision >= 1),
  foreign key (class_id, year_id) references app.school_class(id, year_id),
  check (effective_from < effective_until),
  exclude using gist (student_id with =, year_id with =, daterange(effective_from, effective_until, '[)') with &&)
    where (voided_at is null)
);
create index enrollment_roster_idx on app.enrollment(class_id, effective_from, effective_until) where voided_at is null;

create table app.year_rollover (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references app.account,
  source_year_id uuid not null references app.school_year,
  target_year_id uuid not null references app.school_year,
  configuration jsonb not null,
  snapshot jsonb not null,
  revision integer not null default 1 check (revision >= 1),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  check (source_year_id <> target_year_id)
);

create function app.lock_classes(one uuid, two uuid default null) returns void
language plpgsql volatile set search_path = pg_catalog
as $$
declare class_key uuid;
begin
  for class_key in select distinct key from unnest(array[one, two]) ids(key) where key is not null order by key
  loop
    perform pg_advisory_xact_lock(hashtextextended('madrasty:class:' || class_key::text, 0));
  end loop;
end
$$;

create function app.enrollment_would_fit(
  target uuid, starts date, ends date, max_seats integer, ignored uuid default null
) returns boolean language sql stable security definer set search_path = pg_catalog
as $$
  select max_seats is null or not exists (
    select 1 from (
      select starts as cutoff
      union
      select effective_from from app.enrollment
      where class_id = target and voided_at is null and id is distinct from ignored
        and effective_from > starts and effective_from < ends
    ) candidate
    where (
      select count(*) from app.enrollment
      where class_id = target and voided_at is null and id is distinct from ignored
        and effective_from <= candidate.cutoff and effective_until > candidate.cutoff
    ) >= max_seats
  )
$$;

create function app.guard_enrollment() returns trigger
language plpgsql security definer set search_path = pg_catalog
as $$
declare class_capacity integer; school_begin date; school_end date; year_state text;
begin
  perform app.lock_school_calendar();
  perform app.lock_classes(new.class_id);
  select c.capacity, y.starts_on, y.ends_exclusive, y.state into class_capacity, school_begin, school_end, year_state
  from app.school_class c join app.school_year y on y.id = c.year_id
  where c.id = new.class_id and c.year_id = new.year_id;
  if not found or year_state = 'closed' or new.effective_from < school_begin or new.effective_until > school_end
    or (tg_op = 'UPDATE' and (old.student_id <> new.student_id or old.class_id <> new.class_id
      or old.year_id <> new.year_id or old.effective_from <> new.effective_from or old.voided_at is not null))
  then raise exception 'Invalid enrollment period' using errcode = '23514'; end if;

  if new.voided_at is null and not app.enrollment_would_fit(
      new.class_id, new.effective_from, new.effective_until, class_capacity, new.id)
  then raise exception 'Class capacity exceeded' using errcode = '23P01'; end if;
  return new;
end
$$;
create trigger guard_enrollment before insert or update on app.enrollment
for each row execute function app.guard_enrollment();

create function app.guard_class_capacity() returns trigger
language plpgsql security definer set search_path = pg_catalog
as $$
begin
  perform app.lock_school_calendar();
  perform app.lock_classes(new.id);
  if old.year_id is distinct from new.year_id or old.code is distinct from new.code then
    raise exception 'Class identity is immutable' using errcode = '23514';
  end if;
  if new.capacity is not null and new.capacity is distinct from old.capacity and exists (
    select 1 from app.enrollment e where e.class_id = new.id and e.voided_at is null
      and not app.enrollment_would_fit(new.id, e.effective_from, e.effective_until, new.capacity, e.id)
  ) then raise exception 'Class capacity already exceeded' using errcode = '23P01'; end if;
  return new;
end
$$;
create trigger guard_class_capacity before update on app.school_class
for each row execute function app.guard_class_capacity();

create function app.guard_year_membership() returns trigger
language plpgsql security definer set search_path = pg_catalog
as $$
begin
  if exists (select 1 from app.enrollment e where e.year_id = old.id and e.voided_at is null
    and (e.effective_from < new.starts_on or e.effective_until > new.ends_exclusive)) then
    raise exception 'School-year dates exclude existing enrollments' using errcode = '23514';
  end if;
  return new;
end
$$;
create trigger guard_year_membership before update of starts_on, ends_exclusive on app.school_year
for each row execute function app.guard_year_membership();

create function app.roster_on(target uuid, local_day date)
returns table (student_id uuid, enrollment_id uuid, enrollment_revision integer)
language sql stable set search_path = pg_catalog
as $$
  select e.student_id, e.id, e.revision from app.enrollment e
  where e.class_id = target and e.voided_at is null
    and local_day >= e.effective_from and local_day < e.effective_until
$$;

create function app.class_for_student(child uuid, local_day date) returns uuid
language sql stable set search_path = pg_catalog
as $$
  select e.class_id from app.enrollment e
  where e.student_id = child and e.voided_at is null
    and local_day >= e.effective_from and local_day < e.effective_until
$$;

alter table app.school_class enable row level security;
alter table app.enrollment enable row level security;
alter table app.year_rollover enable row level security;
grant select, insert, update on app.school_class, app.enrollment, app.year_rollover to app_runtime;

create policy class_office_read on app.school_class for select to app_runtime
using ((select app.has_capability('school.manage')) or (select app.has_capability('students.manage')));
create policy class_office_write on app.school_class for all to app_runtime
using ((select app.has_capability('school.manage'))) with check ((select app.has_capability('school.manage')));
create policy enrollment_office on app.enrollment for all to app_runtime
using ((select app.has_capability('students.manage'))) with check ((select app.has_capability('students.manage')));
create policy enrollment_guardian on app.enrollment for select to app_runtime
using (app.has_child_link(student_id) and voided_at is null);
create policy rollover_office on app.year_rollover for all to app_runtime
using ((select app.has_capability('students.manage'))) with check ((select app.has_capability('students.manage')));

revoke all on function app.lock_classes(uuid, uuid), app.enrollment_would_fit(uuid,date,date,integer,uuid),
  app.guard_enrollment(), app.guard_class_capacity(), app.guard_year_membership(),
  app.roster_on(uuid,date), app.class_for_student(uuid,date)
from public, anon, authenticated, service_role;
grant execute on function app.lock_classes(uuid, uuid), app.roster_on(uuid,date), app.class_for_student(uuid,date)
to app_runtime;

create policy year_membership_read on app.school_year for select to app_runtime
using ((select app.has_capability('students.manage')));

create function app.child_current_class(child uuid) returns jsonb
language sql stable security definer set search_path = pg_catalog
as $$
  select jsonb_build_object('id', c.id, 'code', c.code, 'nameAr', c.name_ar, 'nameDe', c.name_de)
  from app.school_settings settings
  join app.enrollment e on e.student_id = child and e.voided_at is null
  join app.school_class c on c.id = e.class_id
  where settings.singleton and app.has_child_link(child)
    and (now() at time zone settings.timezone)::date >= e.effective_from
    and (now() at time zone settings.timezone)::date < e.effective_until
$$;
revoke all on function app.child_current_class(uuid) from public, anon, authenticated, service_role;
grant execute on function app.child_current_class(uuid) to app_runtime;
