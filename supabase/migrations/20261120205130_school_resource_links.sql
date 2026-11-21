create function app.open_school_resource(target jsonb) returns boolean
language plpgsql stable security definer set search_path=pg_catalog
as $$
declare resource uuid:=(target->>'id')::uuid;
begin
  if app.actor_account() is null or app.actor_persona() is null then return false; end if;
  case target->>'kind'
    when 'notice' then return exists(
      select 1 from app.notification n where n.id=resource and n.recipient_id=app.actor_account()
        and n.recipient_persona=app.actor_persona()::text);
    when 'receipt' then return exists(select 1 from app.receipt_payer_document(resource))
      or exists(select 1 from app.receipt_staff_rows(resource,null,null,null,1,false));
    else return app.notice_target_visible(target);
  end case;
end
$$;
revoke all on function app.open_school_resource(jsonb) from public,anon,authenticated,service_role;
grant execute on function app.open_school_resource(jsonb) to app_runtime;
