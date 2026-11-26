-- Only currently visible directory entries matching the actual thread counterpart.
create function app.contact_for_thread(target uuid)
returns text language sql stable security definer set search_path=pg_catalog
as $$
  select d.id from app.thread t
  left join app.office_case c on c.thread_id=t.id
  join app.directory_contacts() d on (
    t.kind='direct' and (
      (t.pair_first=app.actor_account() and t.persona_first=app.actor_persona()::text and t.pair_second=d.account_id and t.persona_second=d.target_persona::text)
      or (t.pair_second=app.actor_account() and t.persona_second=app.actor_persona()::text and t.pair_first=d.account_id and t.persona_first=d.target_persona::text)
    )
    or (t.kind='office' and c.requester_id=app.actor_account() and d.account_id is null and d.id=c.inbox)
  )
  where t.id=target and app.guard_actor() and app.thread_can_access(t.id)
  order by d.id limit 1
$$;
revoke all on function app.contact_for_thread(uuid) from public,anon,authenticated,service_role;
grant execute on function app.contact_for_thread(uuid) to app_runtime;
