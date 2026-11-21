create table app.account (
  id uuid primary key default gen_random_uuid(),
  provider_subject uuid unique,
  status text not null default 'pending' check (status in ('pending', 'active', 'disabled')),
  authorization_revision integer not null default 1 check (authorization_revision >= 1),
  created_at timestamptz not null default now()
);

create table app.persona_grant (
  account_id uuid not null references app.account,
  persona app.persona not null,
  effective_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  check (expires_at is null or expires_at > effective_at),
  primary key (account_id, persona)
);

create table app.session_binding (
  provider_session_id uuid primary key,
  account_id uuid not null references app.account,
  active_persona app.persona not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  foreign key (account_id, active_persona) references app.persona_grant(account_id, persona)
);
create index session_binding_account_idx on app.session_binding(account_id)
where revoked_at is null;

create table app.sign_in_window (
  rate_key text primary key check (rate_key ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  attempts integer not null
);

alter table app.account enable row level security;
alter table app.persona_grant enable row level security;
alter table app.session_binding enable row level security;
alter table app.sign_in_window enable row level security;

create function app.active_personas(school_account uuid) returns app.persona[]
language sql stable set search_path = pg_catalog
as $$
  select coalesce(array_agg(persona order by
    case persona when 'guardian' then 1 when 'teacher' then 2 else 3 end), '{}')
  from app.persona_grant
  where account_id = school_account and revoked_at is null
    and effective_at <= now() and (expires_at is null or expires_at > now())
$$;

create function app.resolve_session(subject uuid, auth_session uuid, bind_missing boolean)
returns table (account_id uuid, active_persona app.persona, personas app.persona[])
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  school_account uuid;
  allowed app.persona[];
begin
  select a.id into school_account
  from app.account a
  join auth.users u on u.id = a.provider_subject
  join auth.sessions p on p.user_id = u.id
  where a.provider_subject = subject and a.status = 'active'
    and p.id = auth_session and (p.not_after is null or p.not_after > now())
    and u.email_confirmed_at is not null and u.deleted_at is null
    and (u.banned_until is null or u.banned_until <= now())
  for share of a, u, p;
  if school_account is null then return; end if;

  allowed := app.active_personas(school_account);
  if cardinality(allowed) = 0 then return; end if;

  if bind_missing then
    insert into app.session_binding (provider_session_id, account_id, active_persona)
    values (auth_session, school_account, allowed[1])
    on conflict (provider_session_id) do nothing;
  end if;

  return query select s.account_id, s.active_persona, allowed
  from app.session_binding s
  where s.provider_session_id = auth_session and s.account_id = school_account
    and s.revoked_at is null and s.active_persona = any(allowed)
  for share of s;
end
$$;

create function app.guard_actor() returns boolean
language sql security definer set search_path = pg_catalog
as $$
  select exists (
    select 1
    from app.session_binding s
    join app.account a on a.id = s.account_id
    join auth.sessions p on p.id = s.provider_session_id and p.user_id = a.provider_subject
    join auth.users u on u.id = p.user_id
    join app.persona_grant g on g.account_id = s.account_id and g.persona = s.active_persona
    where a.id = app.actor_account() and a.status = 'active'
      and s.provider_session_id = app.actor_session() and s.revoked_at is null
      and s.active_persona = app.actor_persona() and g.revoked_at is null
      and g.effective_at <= now() and (g.expires_at is null or g.expires_at > now())
      and (p.not_after is null or p.not_after > now())
      and u.email_confirmed_at is not null and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= now())
    for share of s, a, p, u, g
  )
$$;

-- One session's device registrations are later joined by C05. The trigger binds the detach
-- to the same write when C05 adds its private delivery tables.
create function app.switch_persona(school_account uuid, auth_session uuid, expected app.persona, next_persona app.persona)
returns boolean
language sql security definer set search_path = pg_catalog
as $$
  with switched as (
    update app.session_binding s set active_persona = next_persona
    from app.account a, auth.sessions p, auth.users u
    where s.provider_session_id = auth_session and s.account_id = school_account and s.revoked_at is null
      and s.active_persona = expected and a.id = s.account_id and a.status = 'active'
      and p.id = s.provider_session_id and p.user_id = a.provider_subject
      and (p.not_after is null or p.not_after > now()) and u.id = p.user_id
      and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until <= now())
      and next_persona = any(app.active_personas(school_account))
    returning s.provider_session_id
  )
  select exists(select 1 from switched)
$$;

create function app.revoke_sessions(school_account uuid, auth_session uuid, revoke_all boolean)
returns boolean
language plpgsql security definer set search_path = pg_catalog
as $$
begin
  if not exists (select 1 from app.session_binding s
      where s.provider_session_id = auth_session and s.account_id = school_account)
  then return false;
  end if;

  update app.session_binding s set revoked_at = now()
  where s.account_id = school_account and (revoke_all or s.provider_session_id = auth_session)
    and s.revoked_at is null;
  return true;
end
$$;

create function app.count_sign_in(rate_digest text, attempt_limit integer) returns boolean
language sql security definer set search_path = pg_catalog
as $$
  with hit as (
    insert into app.sign_in_window as counter (rate_key, window_start, attempts)
    values (rate_digest, now(), 1)
    on conflict (rate_key) do update
      set window_start = case when counter.window_start < now() - interval '10 minutes'
        then now() else counter.window_start end,
          attempts = case when counter.window_start < now() - interval '10 minutes'
        then 1 else least(counter.attempts + 1, 1000) end
    returning attempts
  )
  select attempts <= attempt_limit from hit
$$;

revoke all on function app.active_personas(uuid), app.resolve_session(uuid, uuid, boolean),
  app.guard_actor(), app.switch_persona(uuid, uuid, app.persona, app.persona),
  app.revoke_sessions(uuid, uuid, boolean), app.count_sign_in(text, integer)
from public, anon, authenticated, service_role;

grant execute on function app.resolve_session(uuid, uuid, boolean), app.guard_actor(),
  app.switch_persona(uuid, uuid, app.persona, app.persona), app.revoke_sessions(uuid, uuid, boolean),
  app.count_sign_in(text, integer)
to app_runtime;

create table app.session_logout_ticket (
  digest text primary key check (digest ~ '^[a-f0-9]{64}$'),
  provider_session_id uuid not null unique references app.session_binding,
  deadline timestamptz not null default now() + interval '30 days',
  redeemed_all boolean
);
alter table app.session_logout_ticket enable row level security;

create function app.issue_logout_ticket(school_account uuid, auth_session uuid, ticket_digest text)
returns boolean
language sql security definer set search_path = pg_catalog
as $$
  with inserted as (
    insert into app.session_logout_ticket (provider_session_id, digest)
    select provider_session_id, ticket_digest from app.session_binding
    where account_id = school_account and provider_session_id = auth_session and revoked_at is null
    on conflict (provider_session_id) do update
    set digest = excluded.digest, deadline = excluded.deadline, redeemed_all = null
    returning provider_session_id
  )
  select exists(select 1 from inserted)
$$;

create function app.revoke_with_ticket(ticket_digest text, revoke_all boolean) returns boolean
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  ticket app.session_logout_ticket%rowtype;
  school_account uuid;
begin
  select * into ticket from app.session_logout_ticket where digest = ticket_digest and deadline > now()
    for update;
  if not found then return false; end if;
  if ticket.redeemed_all is not null then return ticket.redeemed_all = revoke_all; end if;
  select account_id into school_account from app.session_binding
    where provider_session_id = ticket.provider_session_id;
  if not app.revoke_sessions(school_account, ticket.provider_session_id, revoke_all) then return false; end if;
  update app.session_logout_ticket set redeemed_all = revoke_all where digest = ticket_digest;
  return true;
end
$$;

revoke all on function app.issue_logout_ticket(uuid, uuid, text), app.revoke_with_ticket(text, boolean)
from public, anon, authenticated, service_role;
grant execute on function app.issue_logout_ticket(uuid, uuid, text), app.revoke_with_ticket(text, boolean)
to app_runtime;

-- Bind this custom Auth hook in D02. An offline device's logout-only
-- ticket then prevents refresh of the revoked provider session as well.
grant usage on schema app to supabase_auth_admin;
grant select (provider_session_id, revoked_at) on app.session_binding to supabase_auth_admin;
create policy auth_hook_read_revocations on app.session_binding for select to supabase_auth_admin using (true);

create function app.block_revoked_auth_refresh(event jsonb) returns jsonb
language plpgsql stable set search_path = pg_catalog
as $$
begin
  if exists (select 1 from app.session_binding
    where provider_session_id = (event #>> '{claims,session_id}')::uuid and revoked_at is not null)
  then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'Session revoked'));
  end if;
  return jsonb_build_object('claims', event -> 'claims');
end
$$;

revoke all on function app.block_revoked_auth_refresh(jsonb) from public, anon, authenticated, service_role;
grant execute on function app.block_revoked_auth_refresh(jsonb) to supabase_auth_admin;
