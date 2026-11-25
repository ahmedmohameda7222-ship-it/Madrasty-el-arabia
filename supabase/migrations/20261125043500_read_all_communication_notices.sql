-- Mark only the active actor's unread, non-superseded notifications.
create function app.read_all_school_notices()
returns integer language sql volatile security definer set search_path=pg_catalog
as $$
  with marked as (
    update app.notification n set read_at=now()
    where app.guard_actor() and n.recipient_id=app.actor_account() and n.recipient_persona=app.actor_persona()::text
      and n.read_at is null and n.superseded_at is null
    returning n.id
  ) select count(*)::int from marked
$$;
revoke all on function app.read_all_school_notices() from public,anon,authenticated,service_role;
grant execute on function app.read_all_school_notices() to app_runtime;
