-- A guardian declaration and its enrollment/financial effects commit atomically.
-- The existing request validation, calendar lock and billing lock remain authoritative.
create function app.declare_enrollment_stop(pupil uuid,last_attended date,term text,explanation text)
returns table(id uuid,effects jsonb)
language plpgsql volatile security definer set search_path=pg_catalog
as $$
declare target uuid;
declare entry app.enrollment_stop%rowtype;
begin
  target:=app.create_enrollment_stop(pupil,last_attended,term,explanation);
  update app.enrollment_stop s set state='approved',revision=2,resolved_at=clock_timestamp(),
    resolved_by=app.actor_account()
    where s.id=target and s.state='pending' and s.requester_id=app.actor_account()
    returning s.* into entry;
  if not found then raise exception 'Pause declaration unavailable' using errcode='42501'; end if;
  perform app.apply_approved_stop_enrollment(entry);
  return query select target,app.apply_approved_stop_charges(entry);
end
$$;
revoke all on function app.declare_enrollment_stop(uuid,date,text,text) from public,anon,authenticated;
grant execute on function app.declare_enrollment_stop(uuid,date,text,text) to app_runtime;
