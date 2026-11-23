-- Classroom teachers and safe, date-scoped changes to recurring lessons.
-- New migration only: existing scheduled records and approved attendance stay unchanged.
set local search_path=pg_catalog,public,extensions;

alter table app.teaching_assignment drop constraint teaching_assignment_kind_check;
alter table app.teaching_assignment add constraint teaching_assignment_kind_check check (kind in ('primary','support','subject'));
alter table app.teaching_assignment drop constraint teaching_assignment_check1;
alter table app.teaching_assignment add constraint teaching_assignment_check1
  check ((kind='subject')=(offering_id is not null));
alter table app.teaching_assignment drop constraint teaching_assignment_check2;
alter table app.teaching_assignment add constraint teaching_assignment_check2
  check (kind='primary' or not (capabilities && array['attendance.mark','attendance.approve']::text[]));
alter table app.teaching_assignment add constraint class_teacher_unique_period
  exclude using gist (class_id with =, staff_id with =, daterange(effective_from,effective_until,'[)') with &&)
  where (kind in ('primary','support') and revoked_at is null);

create or replace function app.teacher_scope(
  target_class uuid,local_day date,action text,offering uuid default null
) returns boolean
language sql stable security definer set search_path=pg_catalog
as $$
  select app.actor_persona()='teacher' and exists (
    select 1 from app.teaching_assignment t
    join app.staff_profile p on p.account_id=app.actor_account()
    where t.class_id=target_class
      and p.role='teacher' and not ('admin'=any(app.active_personas(p.account_id)))
      and app.profile_active_at(p,local_day)
      and app.profile_active_at(p,app.school_today())
      and (
        offering is null
        or t.offering_id=offering
        or (t.kind in ('primary','support') and t.offering_id is null and exists(
          select 1 from app.class_subject o
          where o.id=offering and o.class_id=t.class_id
        ))
      )
      and (action not in ('attendance.mark','attendance.approve') or t.kind='primary')
      and app.teacher_applies(t.id,p.id,local_day,action)
      and app.teacher_applies(t.id,p.id,app.school_today(),action)
  )
$$;


create or replace function app.guard_weekly_slot() returns trigger
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  source app.teaching_assignment%rowtype;
  target_year app.school_year%rowtype;
begin
  perform app.lock_school_calendar();
  if new.canceled_at is not null then return new; end if;
  select * into source from app.teaching_assignment where id = new.assignment_id;
  if not found or (source.offering_id is null and new.offering_id is null) then
    raise exception 'Lesson requires a class subject' using errcode = '23514';
  end if;
  select y.* into target_year from app.school_year y join app.school_class c on c.year_id = y.id where c.id = source.class_id;
  new.year_id := target_year.id;
  new.class_id := source.class_id;
  if source.kind = 'subject' then
    new.offering_id := source.offering_id;
  elsif not exists(select 1 from app.class_subject o where o.id = new.offering_id and o.class_id = source.class_id) then
    raise exception 'Lesson subject must belong to the assigned class' using errcode='23514';
  end if;
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
    raise exception 'Inactive classroom teacher assignment' using errcode = '23514';
  end if;
  return new;
end
$$;


create table app.weekly_slot_override(
  slot_id uuid not null references app.weekly_slot on delete cascade,
  local_date date not null,
  cancelled boolean not null default false,
  assignment_id uuid references app.teaching_assignment,
  offering_id uuid references app.class_subject,
  room_id uuid references app.room,
  starts_minute integer check(starts_minute between 0 and 1439),
  ends_minute integer check(ends_minute between 1 and 1440),
  revision integer not null default 1 check(revision>0),
  primary key(slot_id,local_date),
  check(cancelled or (assignment_id is not null and offering_id is not null and room_id is not null
    and starts_minute is not null and ends_minute is not null and starts_minute < ends_minute))
);
create index weekly_slot_override_dates on app.weekly_slot_override(local_date);
alter table app.weekly_slot_override enable row level security;
grant select,insert,update,delete on app.weekly_slot_override to app_runtime;
create policy weekly_override_editor on app.weekly_slot_override for all to app_runtime
  using ((select app.staff_editor())) with check ((select app.staff_editor()));

create function app.guard_weekly_slot_override() returns trigger
language plpgsql security definer set search_path=pg_catalog
as $$
declare parent app.weekly_slot%rowtype;
        assn app.teaching_assignment%rowtype;
begin
  perform app.lock_school_calendar();
  select * into parent from app.weekly_slot where id=new.slot_id for share;
  if not found or parent.canceled_at is not null or new.local_date < parent.effective_from
    or new.local_date >= parent.effective_until or extract(isodow from new.local_date)::int<>parent.weekday
    or new.local_date < app.school_today()
    or not exists(select 1 from app.school_year y where y.id=parent.year_id and y.state='active')
  then raise exception 'Lesson occurrence is outside editable schedule' using errcode='23514'; end if;
  if not new.cancelled then
    select * into assn from app.teaching_assignment where id=new.assignment_id;
    if not found or assn.class_id<>parent.class_id or assn.revoked_at is not null
      or new.local_date<assn.effective_from or new.local_date>=assn.effective_until
      or not app.staff_assignable(assn.staff_id,new.local_date,new.local_date+1)
      or not exists(select 1 from app.class_subject o where o.id=new.offering_id and o.class_id=parent.class_id)
      or (assn.kind='subject' and assn.offering_id<>new.offering_id)
    then raise exception 'Invalid classroom teacher or subject for occurrence' using errcode='23514'; end if;
  end if;
  return new;
end
$$;
create trigger guard_weekly_slot_override before insert or update on app.weekly_slot_override
  for each row execute function app.guard_weekly_slot_override();

-- Resolve actual occupancy for one day including one-off moved lessons and substitutes.
create function app.timetable_day_occupancy(target_date date)
returns table(slot_id uuid,class_id uuid,room_id uuid,staff_id uuid,starts_minute integer,ends_minute integer)
language sql stable security definer set search_path=pg_catalog
as $$
  with shown as (
    select l.id,l.class_id,coalesce(ch.room_id,l.room_id) room_id,
      coalesce(ch.assignment_id,l.assignment_id) assignment_id,
      coalesce(ch.starts_minute,l.starts_minute) start_minute,
      coalesce(ch.ends_minute,l.ends_minute) end_minute
    from app.weekly_slot l
    left join app.weekly_slot_override ch on ch.slot_id=l.id and ch.local_date=target_date
    where app.staff_editor() and l.canceled_at is null and
      l.effective_from<=target_date and target_date<l.effective_until and
      l.weekday=extract(isodow from target_date) and not coalesce(ch.cancelled,false)
  )
  select s.id,s.class_id,s.room_id,a.staff_id,s.start_minute,s.end_minute
    from shown s join app.teaching_assignment a on a.id=s.assignment_id
  union all
  select s.id,s.class_id,s.room_id,d.staff_id,s.start_minute,s.end_minute
    from shown s join app.substitute_assignment d on d.assignment_id=s.assignment_id
    where d.revoked_at is null and 'academics.log'=any(d.capabilities)
      and target_date>=d.effective_from and target_date<d.effective_until
$$;

create or replace function app.timetable_week(begins date, target_class uuid, target_child uuid)
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
  select l.id,coalesce(ch.assignment_id,l.assignment_id),c.id,c.code,c.name_ar,c.name_de,s.name_ar,s.name_de,r.code,r.name_ar,r.name_de,
    coalesce(delegate.display_name,p.display_name),delegate.id is not null,l.day,coalesce(ch.starts_minute,l.starts_minute),coalesce(ch.ends_minute,l.ends_minute),
    app.is_teaching_day(c.id,l.day),l.revision
  from visible l left join app.weekly_slot_override ch on ch.slot_id=l.id and ch.local_date=l.day
  join app.teaching_assignment chosen on chosen.id=coalesce(ch.assignment_id,l.assignment_id)
  join app.school_class c on c.id = l.class_id join app.class_subject o on o.id = coalesce(ch.offering_id,l.offering_id)
  join app.subject s on s.id = o.subject_id join app.room r on r.id = coalesce(ch.room_id,l.room_id) join app.staff_profile p on p.id = chosen.staff_id
  left join lateral (
    select q.id,q.account_id,q.display_name,d.effective_until
    from app.substitute_assignment d join app.staff_profile q on q.id = d.staff_id join app.account a on a.id = q.account_id
    where d.assignment_id = chosen.id and l.day >= d.effective_from and l.day < d.effective_until
      and d.revoked_at is null and 'academics.log' = any(d.capabilities)
      and app.profile_active_at(q,l.day) and a.status = 'active' and 'teacher' = any(app.active_personas(a.id))
    limit 1
  ) delegate on true
  where coalesce(ch.cancelled,false)=false and (
    (app.staff_editor() and target_child is null)
    or (app.actor_persona() = 'teacher' and target_child is null and l.source_revoked is null and (
      (p.account_id = app.actor_account() and app.profile_active_at(p,app.school_today()))
      or (delegate.account_id = app.actor_account() and delegate.effective_until > app.school_today())
    ))
    or (app.actor_persona() = 'guardian' and target_child is not null and app.has_child_link(target_child) and exists (
      select 1 from app.enrollment e where e.student_id = target_child and e.class_id = l.class_id
        and e.voided_at is null and l.day >= e.effective_from and l.day < e.effective_until
    ))
  )
  order by l.day,coalesce(ch.starts_minute,l.starts_minute),c.code,l.id
$$;



revoke all on function app.guard_weekly_slot_override(),app.timetable_day_occupancy(date)
  from public,anon,authenticated,service_role;
grant execute on function app.timetable_day_occupancy(date) to app_runtime;
