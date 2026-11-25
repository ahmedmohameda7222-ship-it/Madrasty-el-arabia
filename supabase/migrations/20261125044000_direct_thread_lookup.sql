-- Resolve an existing nonempty direct conversation without creating records.
create or replace function app.direct_thread_for_contact(contact_key text)
returns uuid language sql stable security definer set search_path=pg_catalog
as $$
  select t.id
  from app.directory_contacts() d
  join app.thread t on t.kind='direct' and (
    (t.pair_first=app.actor_account() and t.persona_first=app.actor_persona()::text
      and t.pair_second=d.account_id and t.persona_second=d.target_persona::text)
    or (t.pair_second=app.actor_account() and t.persona_second=app.actor_persona()::text
      and t.pair_first=d.account_id and t.persona_first=d.target_persona::text))
  where d.id=contact_key and app.guard_actor() and t.last_sequence>0 and app.thread_can_access(t.id)
  limit 1
$$;
revoke all on function app.direct_thread_for_contact(text) from public,anon,authenticated,service_role;
grant execute on function app.direct_thread_for_contact(text) to app_runtime;
