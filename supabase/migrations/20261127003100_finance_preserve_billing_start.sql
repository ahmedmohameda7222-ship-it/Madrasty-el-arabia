-- Keep an existing historical billing start when enabling/disabling the job.
-- A newly selected start may still not be in the past.
create or replace function app.set_automatic_billing(active boolean,starts date,expected integer)
returns integer language plpgsql volatile security definer set search_path=pg_catalog
as $$
declare rev integer;
declare old_start date;
begin
  if not app.has_capability('finance.issue') then raise exception 'Automatic billing unavailable' using errcode='42501'; end if;
  perform app.lock_school_calendar();
  select a.start_month into old_start from app.automatic_billing a where a.singleton for update;
  if active is null or starts is null or extract(day from starts)<>1 or
      (starts<app.billing_school_month() and starts is distinct from old_start) then
    raise exception 'Invalid start month' using errcode='23514';
  end if;
  update app.automatic_billing a set enabled=active,start_month=starts,revision=a.revision+1
    where a.singleton and a.revision=expected returning a.revision into rev;
  return rev;
end
$$;
revoke all on function app.set_automatic_billing(boolean,date,integer) from public,anon,authenticated,service_role,app_runtime;
grant execute on function app.set_automatic_billing(boolean,date,integer) to app_runtime;
