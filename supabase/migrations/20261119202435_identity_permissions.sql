create table app.capability_grant (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references app.account,
  capability text not null check (capability in ('school.manage', 'students.manage', 'applications.manage', 'attendance.supervise', 'academics.supervise', 'comms.publish', 'finance.read', 'finance.issue', 'finance.post', 'finance.export', 'bank.configure', 'audit.read')),
  valid_from timestamptz not null,
  valid_until timestamptz,
  revoked_at timestamptz,
  check (valid_until is null or valid_until > valid_from)
);
create unique index capability_current_idx on app.capability_grant(account_id, capability) where revoked_at is null;

create table app.inbox_grant (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references app.account,
  inbox text not null check (inbox in ('student_affairs', 'accounts')),
  valid_from timestamptz not null,
  valid_until timestamptz,
  revoked_at timestamptz,
  check (valid_until is null or valid_until > valid_from)
);
create unique index inbox_current_idx on app.inbox_grant(account_id, inbox) where revoked_at is null;

alter table app.capability_grant enable row level security;
alter table app.inbox_grant enable row level security;

create function app.has_capability(needed text) returns boolean
language sql stable security definer set search_path = pg_catalog
as $$
  select coalesce((app.actor_persona() = 'admin' and current_setting('app.assurance', true) = 'aal2')
    and (
      (needed in ('access.manage', 'school.manage', 'students.manage', 'applications.manage', 'attendance.supervise', 'academics.supervise', 'comms.publish', 'finance.read', 'finance.issue', 'finance.post', 'finance.export', 'audit.read')
        and exists(select 1 from app.access_administrator
          where account_id = app.actor_account() and revoked_at is null))
      or exists(select 1 from app.capability_grant
        where account_id = app.actor_account() and capability = needed and revoked_at is null
          and valid_from <= now() and (valid_until is null or valid_until > now()))
    ), false)
$$;

create function app.has_inbox(needed text) returns boolean
language sql stable security definer set search_path = pg_catalog
as $$
  select coalesce(app.actor_persona() = 'admin' and current_setting('app.assurance', true) = 'aal2'
    and exists(select 1 from app.inbox_grant where account_id = app.actor_account() and inbox = needed
      and revoked_at is null and valid_from <= now() and (valid_until is null or valid_until > now())), false)
$$;

create function app.access_targets(page_size integer, after_id uuid)
returns table (account_id uuid, email text)
language sql stable security definer set search_path = pg_catalog
as $$
  select a.id, u.email::text from app.account a left join auth.users u on u.id = a.provider_subject
  where app.has_capability('access.manage') and (after_id is null or a.id > after_id)
    and exists(select 1 from app.persona_grant p where p.account_id = a.id and p.persona in ('admin', 'teacher'))
  order by a.id
  limit least(greatest(page_size, 1), 101)
$$;

create function app.utc_iso(value timestamptz) returns text
language sql immutable set search_path = pg_catalog
as $$ select to_char(value at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') $$;

create function app.access_summary(target uuid) returns jsonb
language sql stable security definer set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'accountId', p.id, 'email', u.email, 'verifiedMfa', app.has_verified_factor(p.id),
    'revision', p.authorization_revision, 'personas', to_jsonb(app.active_personas(p.id)),
    'capabilities', coalesce((
      select jsonb_agg(jsonb_build_object('key', g.capability, 'validFrom', app.utc_iso(g.valid_from),
        'validUntil', app.utc_iso(g.valid_until)) order by g.capability)
      from (
        select capability, valid_from, valid_until from app.capability_grant
        where account_id = p.id and revoked_at is null
        union all
        select 'access.manage', granted_at, null from app.access_administrator
        where account_id = p.id and revoked_at is null
      ) g
    ), '[]'),
    'inboxAssignments', coalesce((
      select jsonb_agg(jsonb_build_object('key', i.inbox, 'validFrom', app.utc_iso(i.valid_from),
        'validUntil', app.utc_iso(i.valid_until)) order by i.inbox)
      from app.inbox_grant i where i.account_id = p.id and i.revoked_at is null
    ), '[]')
  )
  from app.account p left join auth.users u on u.id = p.provider_subject
  where p.id = target and app.has_capability('access.manage')
    and exists(select 1 from app.persona_grant g where g.account_id = p.id and g.persona in ('admin', 'teacher'))
$$;

create function app.replace_access(target uuid, expected_revision integer, proposed jsonb) returns integer
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  current_revision integer;
  current_personas app.persona[];
  next_personas app.persona[];
  remove_root boolean;
  add_root boolean;
  subject uuid;
  account_status text;
begin
  perform pg_advisory_xact_lock(hashtextextended('madrasty:administrator-succession', 0));
  if not app.has_capability('access.manage') or target = app.actor_account() then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  select a.authorization_revision, a.provider_subject, a.status into current_revision, subject, account_status
  from app.account a
  where id = target and exists(select 1 from app.persona_grant g where g.account_id = target and g.persona in ('admin', 'teacher'))
  for update;
  if not found then return null; end if;
  if current_revision <> expected_revision then return -1; end if;
  if account_status = 'disabled' then return -3; end if;

  current_personas := app.active_personas(target);
  select coalesce(array_agg(value::app.persona), '{}') into next_personas
  from jsonb_array_elements_text(proposed -> 'personas');
  if ('guardian' = any(current_personas)) is distinct from ('guardian' = any(next_personas)) then return -3; end if;

  add_root := exists(select 1 from jsonb_array_elements(proposed -> 'capabilities') c where c ->> 'key' = 'access.manage');
  remove_root := not add_root and exists(select 1 from app.access_administrator where account_id = target and revoked_at is null);
  if add_root and (not ('admin' = any(next_personas)) or not app.has_verified_factor(target) or
    exists(select 1 from jsonb_array_elements(proposed -> 'capabilities') c where c ->> 'key' = 'access.manage'
      and (c ->> 'validUntil' is not null or (c ->> 'validFrom')::timestamptz > clock_timestamp())))
  then return -3; end if;
  if remove_root and not exists(
    select 1 from app.access_administrator r join app.account a on a.id = r.account_id
    where r.account_id <> target and r.revoked_at is null and a.status = 'active'
      and 'admin' = any(app.active_personas(a.id)) and app.has_verified_factor(a.id)
  ) then return -2; end if;

  update app.persona_grant set revoked_at = now()
  where account_id = target and persona <> 'guardian' and not (persona = any(next_personas)) and revoked_at is null;

  insert into app.persona_grant as g (account_id, persona)
  select target, p from unnest(next_personas) as p where p <> 'guardian'
  on conflict (account_id, persona) do update set effective_at = now(), expires_at = null, revoked_at = null
    where g.revoked_at is not null or (g.expires_at is not null and g.expires_at <= now());

  if add_root then
    insert into app.access_administrator as r (account_id) values (target)
      on conflict (account_id) do update set revoked_at = null, granted_at = now() where r.revoked_at is not null;
  elsif remove_root then
    update app.access_administrator set revoked_at = now() where account_id = target;
  end if;

  update app.capability_grant set revoked_at = now() where account_id = target and revoked_at is null;
  insert into app.capability_grant (account_id, capability, valid_from, valid_until)
  select target, g ->> 'key', (g ->> 'validFrom')::timestamptz, (g ->> 'validUntil')::timestamptz
  from jsonb_array_elements(proposed -> 'capabilities') g where g ->> 'key' <> 'access.manage';

  update app.inbox_grant set revoked_at = now() where account_id = target and revoked_at is null;
  insert into app.inbox_grant (account_id, inbox, valid_from, valid_until)
  select target, g ->> 'key', (g ->> 'validFrom')::timestamptz, (g ->> 'validUntil')::timestamptz
  from jsonb_array_elements(proposed -> 'inboxAssignments') g;

  update app.account set authorization_revision = authorization_revision + 1 where id = target;
  if subject is not null then perform app.recover_account(subject); end if;
  return current_revision + 1;
end
$$;

revoke all on function app.has_capability(text), app.has_inbox(text), app.access_targets(integer, uuid),
  app.utc_iso(timestamptz), app.access_summary(uuid), app.replace_access(uuid, integer, jsonb)
from public, anon, authenticated, service_role;
grant execute on function app.has_capability(text), app.has_inbox(text), app.access_targets(integer, uuid),
  app.access_summary(uuid), app.replace_access(uuid, integer, jsonb) to app_runtime;

create function app.revoke_admin_grants() returns trigger
language plpgsql security definer set search_path = pg_catalog
as $$
begin
  update app.capability_grant set revoked_at = new.revoked_at
  where account_id = new.account_id and revoked_at is null;
  update app.inbox_grant set revoked_at = new.revoked_at
  where account_id = new.account_id and revoked_at is null;
  return new;
end
$$;
revoke all on function app.revoke_admin_grants() from public, anon, authenticated, service_role;
create trigger revoke_admin_grants after update of revoked_at on app.persona_grant
for each row when (new.persona = 'admin' and new.revoked_at is not null and old.revoked_at is null)
execute function app.revoke_admin_grants();
