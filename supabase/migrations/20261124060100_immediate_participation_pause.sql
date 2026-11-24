-- Register future participation pauses immediately, with the original scope and lock checks.
-- Old pending requests remain historical and can be resolved using their original workflow.
create function app.register_enrollment_pause(pupil uuid,last_attended date,term text,explanation text)
returns table(id uuid,effects jsonb)
language plpgsql volatile security definer set search_path=pg_catalog
as $$
declare request app.enrollment_stop%rowtype;
declare target uuid;
declare result jsonb;
begin
  target:=app.create_enrollment_stop(pupil,last_attended,term,explanation);
  update app.enrollment_stop s set state='approved',revision=s.revision+1,
    resolved_at=clock_timestamp(),resolved_by=app.actor_account()
    where s.id=target returning s.* into request;
  perform app.apply_approved_stop_enrollment(request);
  result:=app.apply_approved_stop_charges(request);
  return query select target,result;
end
$$;
revoke all on function app.register_enrollment_pause(uuid,date,text,text) from public,anon,authenticated,service_role;
grant execute on function app.register_enrollment_pause(uuid,date,text,text) to app_runtime;
