-- Read-only calendar summaries. Existing academic calendar mutations remain unchanged.
create or replace function app.communication_school_days(month_start date,class_filter uuid)
returns table(day date,teaching boolean)
language sql stable security definer set search_path=pg_catalog
as $$
  with dates as (
    select d::date as day from generate_series(month_start::timestamp,(month_start+interval '1 month'-interval '1 day')::timestamp,interval '1 day') d
    where app.guard_actor() and extract(day from month_start)=1
      and (class_filter is null or app.publishing_class_read(class_filter))
  )
  select d.day,case
    when not exists(select 1 from app.school_year y where y.state in ('active','closed') and d.day>=y.starts_on and d.day<y.ends_exclusive) then null
    when class_filter is not null then (
      select app.is_teaching_day(c.id,d.day) from app.school_class c join app.school_year y on y.id=c.year_id
        where c.id=class_filter and d.day>=y.starts_on and d.day<y.ends_exclusive)
    when exists(select 1 from app.school_class c join app.school_year y on y.id=c.year_id
      where y.state in ('active','closed') and d.day>=y.starts_on and d.day<y.ends_exclusive and app.publishing_class_read(c.id))
      then exists(select 1 from app.school_class c join app.school_year y on y.id=c.year_id
      where y.state in ('active','closed') and d.day>=y.starts_on and d.day<y.ends_exclusive and app.publishing_class_read(c.id) and app.is_teaching_day(c.id,d.day))
    else app.is_teaching_day(null,d.day)
  end from dates d order by d.day
$$;
revoke all on function app.communication_school_days(date,uuid) from public,anon,authenticated,service_role;
grant execute on function app.communication_school_days(date,uuid) to app_runtime;
