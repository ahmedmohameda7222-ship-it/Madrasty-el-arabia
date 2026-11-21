create table app.notification (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references app.account,
  recipient_persona text not null check(recipient_persona in ('admin','teacher','guardian','applicant')),
  event_id uuid not null references app.outbox_event,
  logical_key text not null check(char_length(logical_key) between 1 and 220),
  template_key text not null check(template_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  targets jsonb not null check(jsonb_typeof(targets)='array' and jsonb_array_length(targets) between 1 and 50),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  superseded_at timestamptz,
  unique(recipient_id,recipient_persona,logical_key)
);
create index notification_inbox_idx on app.notification(recipient_id,recipient_persona,created_at desc,id desc);
create index notification_unread_idx on app.notification(recipient_id,recipient_persona,created_at desc,id desc)
  where read_at is null and superseded_at is null;

create table app.push_subscription (
  installation_id uuid primary key,
  platform text not null check(platform in ('web','android')),
  account_id uuid not null references app.account,
  session_id uuid not null references app.session_binding,
  persona app.persona not null,
  endpoint_hash bytea not null unique check(octet_length(endpoint_hash)=32),
  subscription jsonb not null check(jsonb_typeof(subscription)='object' and octet_length(subscription::text)<8192),
  delivery_guard uuid not null default gen_random_uuid(),
  confirmed_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index push_account_persona_idx on app.push_subscription(account_id,persona);
create index push_binding_idx on app.push_subscription(session_id);
create index push_expiry_idx on app.push_subscription(expires_at,installation_id);
alter table app.notification enable row level security;
alter table app.push_subscription enable row level security;

create function app.notice_inbox()
returns table(id uuid,template_key text,created_at timestamptz,read_at timestamptz,superseded boolean)
language sql stable security definer set search_path=pg_catalog
as $$
  select n.id,n.template_key,n.created_at,n.read_at,n.superseded_at is not null
  from app.notification n
  where n.recipient_id=app.actor_account() and n.recipient_persona=app.actor_persona()::text
$$;

create function app.notice_unread_count()
returns integer language sql stable security definer set search_path=pg_catalog
as $$
  select count(*)::integer from app.notification n where n.recipient_id=app.actor_account()
    and n.recipient_persona=app.actor_persona()::text and n.read_at is null and n.superseded_at is null
$$;

create function app.read_school_notice(target uuid)
returns timestamptz language sql security definer set search_path=pg_catalog
as $$
  update app.notification n set read_at=coalesce(n.read_at,now())
  where n.id=target and n.recipient_id=app.actor_account() and n.recipient_persona=app.actor_persona()::text
  returning n.read_at
$$;

create function app.notice_target_visible(target jsonb)
returns boolean language plpgsql stable security definer set search_path=pg_catalog
as $$
declare resource uuid:=(target->>'id')::uuid;
declare child uuid:=(target->>'childId')::uuid;
declare on_date date:=(target->>'date')::date;
begin
  case target->>'kind'
    when 'thread' then return app.thread_can_access(resource);
    when 'broadcast' then return exists(select 1 from app.received_school_broadcasts(resource));
    when 'child' then return app.has_child_link(resource) and exists(select 1 from app.student s where s.id=resource);
    when 'attendance' then return app.has_child_link(child) and (
      exists(select 1 from app.approved_attendance_rows(child,null,on_date,on_date,null,true) r where r.id=resource)
      or exists(select 1 from app.attendance_row r where r.id=resource and r.student_id=child and r.school_date=on_date
        and r.confirmed_arrival_at is not null)
    );
    when 'exam' then return app.has_child_link(child) and exists(select 1 from app.exam_projection(child,null,null,resource));
    when 'evaluation' then return app.has_child_link(child) and exists(select 1 from app.evaluation_projection(child,null,null,resource));
    when 'homework' then return app.has_child_link(child) and exists(select 1 from app.homework_projection(child,null,null,resource));
    when 'activity' then return app.has_child_link(child) and exists(select 1 from app.assessed_activity_rows(child,null,resource));
    else return false;
  end case;
end
$$;

create function app.open_school_notice(target uuid)
returns table(targets jsonb)
language sql stable security definer set search_path=pg_catalog
as $$
  select coalesce((
    select jsonb_agg(j.item order by j.position) from jsonb_array_elements(n.targets) with ordinality j(item,position)
    where app.notice_target_visible(j.item)
  ),'[]'::jsonb)
  from app.notification n where n.id=target and n.recipient_id=app.actor_account()
    and n.recipient_persona=app.actor_persona()::text
$$;

create function app.upsert_school_notice(
  recipient uuid,scope text,source uuid,identifier text,template text,destinations jsonb
) returns uuid language plpgsql security definer set search_path=pg_catalog
as $$
declare notice uuid;
begin
  if app.actor_account() is not null then raise exception 'Worker scope required' using errcode='42501'; end if;
  insert into app.notification as n(recipient_id,recipient_persona,event_id,logical_key,template_key,targets)
  values(recipient,scope,source,identifier,template,destinations)
  on conflict(recipient_id,recipient_persona,logical_key) do nothing returning n.id into notice;
  if found then return notice; end if;
  return (select n.id from app.notification n where n.recipient_id=recipient and n.recipient_persona=scope and n.logical_key=identifier);
end
$$;

create function app.bind_push_installation(installation uuid,device text,fingerprint text,credentials jsonb)
returns uuid language plpgsql security definer set search_path=pg_catalog
as $$
declare session uuid:=app.actor_session();
declare account uuid:=app.actor_account();
declare scope app.persona:=app.actor_persona();
declare device_hash bytea:=sha256(convert_to(device||':'||fingerprint,'UTF8'));
declare guard uuid;
declare lock_key bigint;
begin
  perform 1 from app.session_binding s where s.provider_session_id=session and s.account_id=account
    and s.active_persona=scope and s.revoked_at is null for share;
  if not found then raise exception 'Session is unavailable' using errcode='42501'; end if;
  for lock_key in select distinct k from unnest(array[
      hashtextextended('push:installation:'||installation::text,0),
      hashtextextended('push:endpoint:'||encode(device_hash,'hex'),0)
    ]) lock_values(k) order by k
  loop perform pg_advisory_xact_lock(lock_key); end loop;

  delete from app.push_subscription p where p.endpoint_hash=device_hash and p.installation_id<>installation;
  insert into app.push_subscription as p(installation_id,platform,account_id,session_id,persona,endpoint_hash,subscription,expires_at)
  values(installation,device,account,session,scope,device_hash,credentials,now()+interval '45 days')
  on conflict(installation_id) do update set
    delivery_guard=case when (p.account_id,p.session_id,p.persona,p.endpoint_hash,p.subscription)
      is distinct from (excluded.account_id,excluded.session_id,excluded.persona,excluded.endpoint_hash,excluded.subscription)
      then gen_random_uuid() else p.delivery_guard end,
    platform=excluded.platform,account_id=excluded.account_id,session_id=excluded.session_id,persona=excluded.persona,
    endpoint_hash=excluded.endpoint_hash,subscription=excluded.subscription,confirmed_at=now(),expires_at=excluded.expires_at
  returning delivery_guard into guard;
  return guard;
end
$$;

create function app.revoke_push_installation(installation uuid,device text)
returns void language sql security definer set search_path=pg_catalog
as $$
  delete from app.push_subscription p where p.installation_id=installation and p.platform=device
    and p.account_id=app.actor_account() and p.session_id=app.actor_session() and p.persona=app.actor_persona()
$$;

create function app.push_installation_enabled(installation uuid,device text)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
  select exists(select 1 from app.push_subscription p where p.installation_id=installation and p.platform=device
    and p.account_id=app.actor_account() and p.session_id=app.actor_session() and p.persona=app.actor_persona() and p.expires_at>now())
$$;

create function app.detach_session_push_installations() returns trigger
language plpgsql security definer set search_path=pg_catalog
as $$
begin
  delete from app.push_subscription p where p.session_id=new.provider_session_id;
  return new;
end
$$;
create trigger detach_session_push_installations after update of revoked_at,active_persona on app.session_binding
for each row when (old.revoked_at is distinct from new.revoked_at or old.active_persona is distinct from new.active_persona)
execute function app.detach_session_push_installations();

create function app.detach_account_push_installations() returns trigger
language plpgsql security definer set search_path=pg_catalog
as $$
begin
  delete from app.push_subscription p where p.account_id=new.id;
  return new;
end
$$;
create trigger detach_account_push_installations after update of status on app.account
for each row when (old.status is distinct from new.status and new.status<>'active')
execute function app.detach_account_push_installations();

create function app.expire_push_installations(maximum integer)
returns integer language sql security definer set search_path=pg_catalog
as $$
  with expired as (
    select p.installation_id from app.push_subscription p
    where p.expires_at<=now() or not exists(
      select 1 from app.session_binding s join app.account a on a.id=s.account_id and a.status='active'
      join auth.sessions x on x.id=s.provider_session_id and x.user_id=a.provider_subject and (x.not_after is null or x.not_after>now())
      where s.provider_session_id=p.session_id and s.account_id=p.account_id and s.active_persona=p.persona
        and s.revoked_at is null and p.persona=any(app.active_personas(p.account_id))
    ) order by p.expires_at,p.installation_id limit least(greatest(maximum,1),100) for update skip locked
  ), removed as (
    delete from app.push_subscription p using expired e where p.installation_id=e.installation_id returning p.installation_id
  ) select count(*)::integer from removed
$$;

revoke all on function app.notice_inbox(),app.notice_unread_count(),app.read_school_notice(uuid),
  app.notice_target_visible(jsonb),app.open_school_notice(uuid),app.upsert_school_notice(uuid,text,uuid,text,text,jsonb),
  app.bind_push_installation(uuid,text,text,jsonb),app.revoke_push_installation(uuid,text),app.push_installation_enabled(uuid,text),
  app.detach_session_push_installations(),app.detach_account_push_installations(),app.expire_push_installations(integer)
from public,anon,authenticated,service_role;
grant execute on function app.notice_inbox(),app.notice_unread_count(),app.read_school_notice(uuid),
  app.open_school_notice(uuid),app.upsert_school_notice(uuid,text,uuid,text,text,jsonb),app.bind_push_installation(uuid,text,text,jsonb),
  app.revoke_push_installation(uuid,text),app.push_installation_enabled(uuid,text),app.expire_push_installations(integer)
to app_runtime;
