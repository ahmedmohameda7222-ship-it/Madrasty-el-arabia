create table app.access_administrator (
  account_id uuid primary key references app.account,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table app.access_administrator enable row level security;

create table app.initial_admin (
  singleton boolean primary key default true check (singleton),
  submitted_email text not null,
  account_id uuid unique references app.account,
  provider_subject uuid unique,
  created_at timestamptz not null default now(),
  activated_at timestamptz
);
alter table app.initial_admin enable row level security;

create table app.mfa_challenge (
  id uuid primary key,
  session_id uuid not null references app.session_binding(provider_session_id),
  factor_id uuid not null,
  expires_at timestamptz not null
);
alter table app.mfa_challenge enable row level security;

create table app.session_cutoff (
  account_id uuid primary key references app.account,
  cutoff_at timestamptz not null
);
alter table app.session_cutoff enable row level security;

create function app.has_verified_factor(school_account uuid) returns boolean
language sql stable security definer set search_path = pg_catalog
as $$
  select exists(select 1 from app.account a join auth.mfa_factors m on m.user_id = a.provider_subject
    where a.id = school_account and m.status = 'verified')
$$;

create function app.session_after_cutoff(school_account uuid, auth_session uuid) returns boolean
language sql stable security definer set search_path = pg_catalog
as $$
  select not exists (
    select 1 from app.session_cutoff c join auth.sessions s on s.id = auth_session
    where c.account_id = school_account and s.created_at < c.cutoff_at
  )
$$;

-- Cover provider sessions created before recovery but not yet bound to a school persona.
create function app.identity_cutoff_guard() returns trigger
language plpgsql security definer set search_path = pg_catalog
as $$
begin
  if not app.session_after_cutoff(new.account_id, new.provider_session_id) then
    new.revoked_at := now();
  end if;
  return new;
end
$$;
create trigger identity_cutoff_guard before insert on app.session_binding
for each row execute function app.identity_cutoff_guard();

create function app.recover_account(subject uuid) returns void
language plpgsql security definer set search_path = pg_catalog
as $$
declare school_account uuid;
begin
  select id into school_account from app.account where provider_subject = subject for update;
  if school_account is null then return; end if;
  insert into app.session_cutoff as c (account_id, cutoff_at) values (school_account, clock_timestamp())
    on conflict (account_id) do update set cutoff_at = greatest(c.cutoff_at, excluded.cutoff_at);
  update app.session_binding set revoked_at = now() where account_id = school_account and revoked_at is null;
end
$$;

create function app.remember_mfa_challenge(auth_session uuid, challenge uuid, factor uuid, expires timestamptz)
returns void language sql security definer set search_path = pg_catalog
as $$
  insert into app.mfa_challenge(id, session_id, factor_id, expires_at)
    values (challenge, auth_session, factor, least(expires, now() + interval '5 minutes'))
$$;

create function app.use_mfa_challenge(auth_session uuid, challenge uuid) returns uuid
language sql security definer set search_path = pg_catalog
as $$
  delete from app.mfa_challenge where id = challenge and session_id = auth_session
    and expires_at > now() returning factor_id
$$;

create function app.confirm_admin_assurance(school_account uuid) returns void
language sql security definer set search_path = pg_catalog
as $$
  update app.initial_admin set activated_at = coalesce(activated_at, now())
  where account_id = school_account and activated_at is null and app.has_verified_factor(school_account)
$$;

create function app.deactivate_staff(school_account uuid, target uuid, whole_account boolean, expected_revision integer)
returns integer
language plpgsql security definer set search_path = pg_catalog
as $$
declare prior_revision integer; provider_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('madrasty:administrator-succession', 0));
  if app.actor_account() is distinct from school_account or app.actor_persona() is distinct from 'admin'
    or current_setting('app.assurance', true) is distinct from 'aal2'
    or not app.has_verified_factor(school_account)
    or not exists (select 1 from app.access_administrator where account_id = school_account and revoked_at is null)
  then
    raise exception 'Access denied' using errcode = '42501';
  end if;

  select authorization_revision, provider_subject into prior_revision, provider_id from app.account where id = target for update;
  if not found then return null; end if;
  if prior_revision <> expected_revision then return -1; end if;

  if exists (select 1 from app.access_administrator where account_id = target and revoked_at is null)
    and not exists (
      select 1 from app.access_administrator a
      join app.account person on person.id = a.account_id
      where a.account_id <> target and a.revoked_at is null and person.status = 'active'
        and 'admin' = any(app.active_personas(a.account_id)) and app.has_verified_factor(a.account_id)
    )
  then return -2;
  end if;

  update app.access_administrator set revoked_at = now() where account_id = target and revoked_at is null;
  update app.persona_grant set revoked_at = now() where account_id = target and revoked_at is null
    and (whole_account or persona in ('admin', 'teacher'));
  update app.session_binding set revoked_at = now() where account_id = target and revoked_at is null;
  update app.account set status = case when whole_account then 'disabled' else status end,
    authorization_revision = authorization_revision + 1 where id = target;
  if provider_id is not null then perform app.recover_account(provider_id); end if;
  return prior_revision + 1;
end
$$;

revoke all on function app.has_verified_factor(uuid), app.session_after_cutoff(uuid, uuid),
  app.identity_cutoff_guard(), app.recover_account(uuid), app.remember_mfa_challenge(uuid, uuid, uuid, timestamptz),
  app.use_mfa_challenge(uuid, uuid), app.confirm_admin_assurance(uuid), app.deactivate_staff(uuid, uuid, boolean, integer)
from public, anon, authenticated, service_role;
grant execute on function app.has_verified_factor(uuid), app.recover_account(uuid),
  app.remember_mfa_challenge(uuid, uuid, uuid, timestamptz), app.use_mfa_challenge(uuid, uuid),
  app.confirm_admin_assurance(uuid), app.deactivate_staff(uuid, uuid, boolean, integer)
to app_runtime;

create function app.initial_activation_pending(subject uuid) returns boolean
language sql stable security definer set search_path = pg_catalog
as $$
  select exists (
    select 1 from app.initial_admin b join app.account a on a.id = b.account_id
    join auth.users u on u.id = a.provider_subject
    where b.provider_subject = subject and b.activated_at is null and a.status = 'pending'
      and lower(u.email) = b.submitted_email and u.email_confirmed_at is not null
  )
$$;

create function app.activate_initial_admin(subject uuid) returns boolean
language plpgsql security definer set search_path = pg_catalog
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('madrasty:administrator-succession', 0));
  if not app.initial_activation_pending(subject) then return false; end if;
  update app.account set status = 'active' where provider_subject = subject and status = 'pending';
  return found;
end
$$;

revoke all on function app.initial_activation_pending(uuid), app.activate_initial_admin(uuid)
from public, anon, authenticated, service_role;
grant execute on function app.initial_activation_pending(uuid), app.activate_initial_admin(uuid) to app_runtime;
