create table app.teacher_invite_contact (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(display_name) between 1 and 200),
  email text not null unique check (email = lower(btrim(email))),
  correspondence_locale text not null check (correspondence_locale in ('ar', 'de')),
  account_id uuid unique references app.account
);

create table app.invitation (
  id uuid primary key,
  kind text not null check (kind in ('guardian','teacher')),
  recipient_id uuid not null,
  batch_id uuid references app.family_import_job,
  email text not null check (email = lower(btrim(email))),
  locale text not null check (locale in ('ar','de')),
  generation integer not null check (generation >= 1),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  sealed_token text,
  sealed_proof text,
  proof_hash text check (proof_hash ~ '^[0-9a-f]{64}$'),
  delivery text not null default 'ready' check (delivery in ('ready','queued','sent','bounced')),
  validity text not null default 'pending' check (validity in ('pending','expired','replaced','revoked','activated')),
  created_by uuid not null references app.account,
  revision integer not null default 1 check (revision >= 1),
  expires_at timestamptz not null default now() + interval '24 hours',
  consumed_at timestamptz,
  consumed_subject uuid,
  redeem_key text,
  unique (kind, recipient_id, generation)
);
create unique index invitation_one_pending on app.invitation(kind, recipient_id) where validity = 'pending';

alter table app.teacher_invite_contact enable row level security;
alter table app.invitation enable row level security;
grant select, insert, update on app.teacher_invite_contact, app.invitation to app_runtime;
create policy teacher_invite_office on app.teacher_invite_contact for all to app_runtime
  using ((select app.has_capability('applications.manage')))
  with check ((select app.has_capability('applications.manage')));
create policy invite_office on app.invitation for all to app_runtime
  using ((kind = 'guardian' and (select app.has_capability('students.manage')))
    or (kind = 'teacher' and (select app.has_capability('applications.manage'))))
  with check ((kind = 'guardian' and (select app.has_capability('students.manage')))
    or (kind = 'teacher' and (select app.has_capability('applications.manage'))));

create function app.guardian_link_available(adult uuid) returns boolean
language sql stable security definer set search_path = pg_catalog
as $$
  select exists (select 1 from app.child_link l join app.student s on s.id = l.student_id
    where l.guardian_id = adult and l.state = 'approved' and s.state = 'active'
      and l.effective_from <= now() and (l.effective_until is null or l.effective_until > now()))
$$;

create function app.invitation_valid_target(candidate app.invitation) returns boolean
language sql stable security definer set search_path = pg_catalog
as $$
  select case candidate.kind
    when 'guardian' then exists (select 1 from app.guardian_profile g where g.id = candidate.recipient_id
      and g.contact_email = candidate.email and app.guardian_link_available(g.id))
    when 'teacher' then exists (select 1 from app.teacher_invite_contact t where t.id = candidate.recipient_id
      and t.email = candidate.email)
    else false end
$$;

create function app.activation_target(school_token text, provider_proof text)
returns table (email text)
language sql security definer set search_path = pg_catalog
as $$
  select i.email from app.invitation i where i.token_hash = school_token and i.proof_hash = provider_proof
    and i.validity = 'pending' and i.expires_at > now() and app.invitation_valid_target(i)
    and not exists (select 1 from app.account a join auth.users u on u.id = a.provider_subject
      where lower(u.email) = i.email)
$$;

create function app.claim_invitation(school_token text, subject uuid, auth_session uuid, supplied_key text)
returns table (account_id uuid, persona app.persona)
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  invite app.invitation%rowtype;
  adult_account uuid; prior_account uuid; adult_email text; role_name app.persona;
begin
  select * into invite from app.invitation where token_hash = school_token for update;
  if not found or not app.invitation_valid_target(invite) then return; end if;

  select lower(u.email) into adult_email from auth.users u join auth.sessions s on s.user_id = u.id
  where u.id = subject and s.id = auth_session and u.email_confirmed_at is not null and u.deleted_at is null
    and (s.not_after is null or s.not_after > now()) and (u.banned_until is null or u.banned_until <= now())
  for share of u, s;
  if adult_email is null or adult_email <> invite.email then return; end if;
  role_name := invite.kind::app.persona;

  if invite.validity = 'activated' then
    if invite.consumed_subject is distinct from subject or invite.redeem_key is distinct from supplied_key then return; end if;
    return query select a.id, role_name from app.account a where a.provider_subject = subject and a.status = 'active'
      and role_name = any(app.active_personas(a.id));
    return;
  end if;
  if invite.validity <> 'pending' or invite.expires_at <= now() then return; end if;

  perform pg_advisory_xact_lock(hashtextextended('madrasty:invite-identity:' || subject::text, 0));
  select a.id into adult_account from app.account a where a.provider_subject = subject and a.status = 'active' for update;
  if adult_account is null then
    if exists(select 1 from app.account a where a.provider_subject = subject) then return; end if;
    insert into app.account (provider_subject, status) values (subject, 'active') returning id into adult_account;
  end if;

  if role_name = 'guardian' then
    select g.account_id into prior_account from app.guardian_profile g where g.id = invite.recipient_id for update;
    if prior_account is not null and prior_account <> adult_account then
      raise exception 'Invite recipient ownership changed' using errcode = '23514';
    end if;
    update app.guardian_profile set account_id = adult_account, revision = revision + 1
      where id = invite.recipient_id and app.guardian_link_available(invite.recipient_id);
  else
    select t.account_id into prior_account from app.teacher_invite_contact t where t.id = invite.recipient_id for update;
    if prior_account is not null and prior_account <> adult_account then
      raise exception 'Invite recipient ownership changed' using errcode = '23514';
    end if;
    update app.teacher_invite_contact set account_id = adult_account where id = invite.recipient_id;
  end if;
  if not found then raise exception 'Invite recipient no longer available' using errcode = '23514'; end if;

  insert into app.persona_grant as g (account_id, persona)
  values (adult_account, role_name)
  on conflict on constraint persona_grant_pkey do update
    set effective_at = now(), expires_at = null, revoked_at = null
    where g.revoked_at is not null or (g.expires_at is not null and g.expires_at <= now());

  update app.invitation set validity = 'activated', consumed_subject = subject, consumed_at = now(),
    redeem_key = supplied_key, sealed_token = null, sealed_proof = null, proof_hash = null, revision = revision + 1 where id = invite.id;
  return query select adult_account, role_name;
end
$$;

create function app.end_invitations_on_unlink() returns trigger
language plpgsql security definer set search_path = pg_catalog
as $$
begin
  if not app.guardian_link_available(new.guardian_id) then
    update app.invitation set validity = 'revoked', sealed_token = null, sealed_proof = null, proof_hash = null, revision = revision + 1
    where kind = 'guardian' and recipient_id = new.guardian_id and validity = 'pending';
  end if;
  return new;
end
$$;
create trigger end_invitations_on_unlink after update of state on app.child_link
for each row when (new.state = 'revoked' and old.state <> 'revoked')
execute function app.end_invitations_on_unlink();

revoke all on function app.guardian_link_available(uuid), app.invitation_valid_target(app.invitation),
  app.activation_target(text,text), app.claim_invitation(text,uuid,uuid,text), app.end_invitations_on_unlink()
from public, anon, authenticated, service_role;
grant execute on function app.guardian_link_available(uuid), app.activation_target(text,text),
  app.claim_invitation(text,uuid,uuid,text) to app_runtime;



create role app_invite_worker nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant usage on schema app to app_invite_worker;

create function app.invitation_delivery_input(invite_id uuid, expected_generation integer)
returns table (email text, locale text, sealed_token text, sealed_proof text, existing_identity boolean)
language sql security definer set search_path = pg_catalog
as $$
  select i.email, i.locale, i.sealed_token, i.sealed_proof,
    exists(select 1 from auth.users u where lower(u.email) = i.email and u.email_confirmed_at is not null and u.deleted_at is null)
  from app.invitation i
  where i.id = invite_id and i.generation = expected_generation and i.validity = 'pending'
    and i.expires_at > now() and i.delivery in ('ready','queued') and i.sealed_token is not null
    and app.invitation_valid_target(i)
$$;

create function app.save_invitation_proof(invite_id uuid, expected_generation integer, encrypted text, proof_digest text)
returns boolean language sql security definer set search_path = pg_catalog
as $$
  with saved as (
    update app.invitation i set sealed_proof = encrypted, proof_hash = proof_digest
    where i.id = invite_id and i.generation = expected_generation and i.validity = 'pending'
      and i.expires_at > now() and i.delivery in ('ready','queued')
      and app.invitation_valid_target(i)
    returning i.id
  )
  select exists(select 1 from saved)
$$;

create function app.mark_invitation_delivery(invite_id uuid, expected_generation integer, outcome text)
returns boolean language sql security definer set search_path = pg_catalog
as $$
  with saved as (
    update app.invitation i set delivery = outcome, sealed_token = null, sealed_proof = null, revision = revision + 1
    where i.id = invite_id and i.generation = expected_generation and i.validity = 'pending'
      and ((outcome = 'sent' and i.delivery in ('ready','queued'))
        or (outcome = 'bounced' and i.delivery in ('ready','queued','sent')))
    returning i.id
  )
  select exists(select 1 from saved)
$$;

revoke all on function app.invitation_delivery_input(uuid,integer), app.save_invitation_proof(uuid,integer,text,text),
  app.mark_invitation_delivery(uuid,integer,text) from public, anon, authenticated, service_role;
grant execute on function app.invitation_delivery_input(uuid,integer), app.save_invitation_proof(uuid,integer,text,text),
  app.mark_invitation_delivery(uuid,integer,text) to app_invite_worker;
