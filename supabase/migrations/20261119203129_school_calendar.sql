create table app.school_settings (
  singleton boolean primary key default true check (singleton),
  timezone text not null check (length(timezone) between 1 and 128),
  name_ar text not null check (length(name_ar) between 1 and 200),
  name_de text not null check (length(name_de) between 1 and 200),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  due_day smallint not null check (due_day between 1 and 31),
  revision bigint not null default 1 check (revision > 0)
);

create function app.valid_weekdays(days smallint[]) returns boolean
language sql immutable set search_path = pg_catalog
as $$
  select cardinality(days) between 1 and 7
    and (select count(distinct day) from unnest(days) d(day) where day between 1 and 7) = cardinality(days)
$$;

create function app.valid_school_timezone() returns trigger
language plpgsql set search_path = pg_catalog
as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown school time zone' using errcode = '23514';
  end if;
  return new;
end
$$;
create trigger valid_school_timezone before insert or update of timezone on app.school_settings
for each row execute function app.valid_school_timezone();

create table app.school_year (
  id uuid primary key default gen_random_uuid(),
  starts_on date not null,
  ends_exclusive date not null,
  teaching_weekdays smallint[] not null check (app.valid_weekdays(teaching_weekdays)),
  state text not null default 'draft' check (state in ('draft','active','closed')),
  revision bigint not null default 1 check (revision > 0),
  check (starts_on < ends_exclusive),
  exclude using gist (daterange(starts_on, ends_exclusive, '[)') with &&)
);

create table app.day_exception (
  id uuid primary key default gen_random_uuid(),
  year_id uuid not null references app.school_year,
  class_id uuid constraint day_exception_class_pending check (class_id is null),
  school_date date not null,
  teaching boolean not null,
  reason text not null check (length(reason) between 1 and 400),
  revision bigint not null default 1 check (revision > 0),
  constraint day_exception_scope unique nulls not distinct (year_id, class_id, school_date)
);

create function app.is_teaching_day(school_class uuid, local_day date) returns boolean
language sql stable security definer set search_path = pg_catalog
as $$
  select coalesce((
    select coalesce(
      (select e.teaching from app.day_exception e where e.year_id = y.id
        and e.school_date = local_day and e.class_id = school_class),
      (select e.teaching from app.day_exception e where e.year_id = y.id
        and e.school_date = local_day and e.class_id is null),
      extract(isodow from local_day)::smallint = any(y.teaching_weekdays)
    )
    from app.school_year y where y.state in ('active','closed')
      and daterange(y.starts_on, y.ends_exclusive, '[)') @> local_day
  ), false)
$$;

create function app.lock_school_calendar() returns void
language sql volatile set search_path = pg_catalog
as $$ select pg_advisory_xact_lock(hashtextextended('madrasty:school-calendar', 0)) $$;

create function app.guard_day_exception() returns trigger
language plpgsql set search_path = pg_catalog
as $$
begin
  perform app.lock_school_calendar();
  if not exists(select 1 from app.school_year y where id = new.year_id
    and new.school_date >= y.starts_on and new.school_date < y.ends_exclusive and y.state <> 'closed')
  then raise exception 'Day outside editable year' using errcode = '23514'; end if;
  return new;
end
$$;
create trigger guard_day_exception before insert or update on app.day_exception
for each row execute function app.guard_day_exception();

create function app.guard_school_year() returns trigger
language plpgsql set search_path = pg_catalog
as $$
begin
  perform app.lock_school_calendar();
  if old.state = 'closed' or (old.state = 'active' and new.state = 'draft') then
    raise exception 'School-year transition not allowed' using errcode = '23514';
  end if;
  if exists (select 1 from app.day_exception e where e.year_id = old.id
    and (e.school_date < new.starts_on or e.school_date >= new.ends_exclusive)) then
    raise exception 'School-year dates exclude a saved day' using errcode = '23514';
  end if;
  return new;
end
$$;
create trigger guard_school_year before update on app.school_year
for each row execute function app.guard_school_year();

alter table app.school_settings enable row level security;
alter table app.school_year enable row level security;
alter table app.day_exception enable row level security;

grant select, insert, update on app.school_settings, app.school_year, app.day_exception to app_runtime;
create policy settings_office on app.school_settings for all to app_runtime
using ((select app.has_capability('school.manage'))) with check ((select app.has_capability('school.manage')));
create policy year_office on app.school_year for all to app_runtime
using ((select app.has_capability('school.manage'))) with check ((select app.has_capability('school.manage')));
create policy exception_office on app.day_exception for all to app_runtime
using ((select app.has_capability('school.manage'))) with check ((select app.has_capability('school.manage')));

revoke all on function app.valid_weekdays(smallint[]), app.valid_school_timezone(), app.is_teaching_day(uuid, date),
  app.lock_school_calendar(), app.guard_day_exception(), app.guard_school_year()
from public, anon, authenticated, service_role;
grant execute on function app.valid_weekdays(smallint[]), app.is_teaching_day(uuid, date), app.lock_school_calendar()
to app_runtime;
