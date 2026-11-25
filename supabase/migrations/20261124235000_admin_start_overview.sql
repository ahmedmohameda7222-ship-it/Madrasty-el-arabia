-- Additive projection for the admin home. No changes to existing tables or policies.
create function app.admin_start_school_days() returns jsonb
language sql stable security definer set search_path=pg_catalog
as $$
with ctx as (
 select app.school_today() as today, app.has_capability('attendance.supervise') as attendance,
   (app.has_capability('school.manage') or app.has_capability('academics.supervise')) as schedule,
   (app.has_capability('academics.supervise') and app.has_capability('attendance.supervise')) as monitor
 where app.actor_persona()='admin' and app.guard_actor()
), days as (
 select d.day::date as day from ctx cross join app.school_year y
 cross join lateral generate_series(y.starts_on::timestamp,(y.ends_exclusive-1)::timestamp,interval '1 day') d(day)
 where y.state in ('active','closed') and
 (exists(select 1 from app.school_class c where c.year_id=y.id and app.is_teaching_day(c.id,d.day::date))
   or (not exists(select 1 from app.school_class c where c.year_id=y.id) and app.is_teaching_day(null,d.day::date)))
), bounds as (
 select ctx.*, (select max(day) from days where day<=ctx.today) as last,
  (select min(day) from days where day>ctx.today) as next from ctx
), classes as (
 select c.id from bounds b join app.school_year y on b.last>=y.starts_on and b.last<y.ends_exclusive
 join app.school_class c on c.year_id=y.id where b.attendance and app.is_teaching_day(c.id,b.last)
), sheets as (
 select distinct on (a.class_id) a.id,a.class_id from bounds b join app.attendance_sheet a on a.school_date=b.last
 join classes c on c.id=a.class_id
 where b.attendance and a.state='approved' and a.calendar_cancelled_at is null order by a.class_id,a.id
)
select jsonb_build_object('schoolDays',jsonb_build_object('last',b.last,'next',b.next),
 'maySchedule',b.schedule,'mayMonitor',b.monitor,
 'attendance',case when b.attendance and b.last is not null then jsonb_build_object(
 'date',b.last,'expectedClasses',(select count(*) from classes),'approvedClasses',(select count(*) from sheets),
 'present',(select count(*) from sheets s join app.attendance_row r on r.sheet_id=s.id where r.status='present'),
 'late',(select count(*) from sheets s join app.attendance_row r on r.sheet_id=s.id where r.status='late'),
 'absent',(select count(*) from sheets s join app.attendance_row r on r.sheet_id=s.id where r.status in ('absent_excused','absent_unexcused'))
 ) end) from bounds b
$$;
revoke all on function app.admin_start_school_days() from public,anon,authenticated,service_role;
grant execute on function app.admin_start_school_days() to app_runtime;
