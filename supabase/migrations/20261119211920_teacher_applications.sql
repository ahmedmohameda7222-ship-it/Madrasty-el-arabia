create table app.applicant_intake (
  email text primary key check (email = lower(btrim(email))),
  locale text not null check (locale in ('ar','de')),
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
alter table app.applicant_intake enable row level security;

create table app.teacher_application (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null unique references app.account,
  display_name text not null check (length(display_name) between 1 and 200),
  work_contact text,
  requested_subjects text[] not null default '{}',
  correspondence_locale text not null check (correspondence_locale in ('ar','de')),
  state text not null default 'submitted' check (state in ('submitted','approved','declined')),
  revision integer not null default 1 check (revision >= 1),
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references app.account,
  applicant_message text,
  check ((state = 'submitted') = (decided_at is null and decided_by is null))
);
alter table app.teacher_application enable row level security;
grant select on app.teacher_application to app_runtime;
create policy teacher_application_office_read on app.teacher_application for select to app_runtime
using ((select app.has_capability('applications.manage')));

create function app.record_applicant_intake(address text, preferred text) returns void
language sql security definer set search_path = pg_catalog
as $$
  insert into app.applicant_intake(email, locale) values (address, preferred)
  on conflict (email) do update set locale = excluded.locale, requested_at = now(), expires_at = now() + interval '24 hours'
$$;

create function app.applicant_can_activate(subject uuid, auth_session uuid) returns boolean
language sql stable security definer set search_path = pg_catalog
as $$
  select exists(select 1 from auth.users u join auth.sessions s on s.user_id = u.id
    join app.applicant_intake t on t.email = lower(u.email)
    where u.id = subject and s.id = auth_session and t.expires_at > now() and u.email_confirmed_at is not null
      and u.deleted_at is null and (u.banned_until is null or u.banned_until <= now())
      and (s.not_after is null or s.not_after > now())
      and not exists(select 1 from app.account a where a.provider_subject = u.id))
$$;

create function app.applicant_identity(subject uuid, auth_session uuid, bind_missing boolean) returns uuid
language plpgsql security definer set search_path = pg_catalog
as $$
declare result uuid; verified_email text;
begin
  select lower(u.email) into verified_email
  from auth.users u join auth.sessions s on s.user_id = u.id
  where u.id = subject and s.id = auth_session and u.email_confirmed_at is not null and u.deleted_at is null
    and (u.banned_until is null or u.banned_until <= now()) and (s.not_after is null or s.not_after > now())
  for share of u, s;
  if verified_email is null then return null; end if;

  perform pg_advisory_xact_lock(hashtextextended('madrasty:invite-identity:' || subject::text, 0));
  select id into result from app.account a where a.provider_subject = subject and a.status = 'active'
    and app.session_after_cutoff(a.id, auth_session)
    and not exists(select 1 from app.session_binding b where b.provider_session_id = auth_session and b.revoked_at is not null);
  if result is not null then return result; end if;
  if not bind_missing or exists(select 1 from app.account a where a.provider_subject = subject) then return null; end if;
  if not exists(select 1 from app.applicant_intake t where t.email = verified_email and t.expires_at > now()) then return null; end if;

  insert into app.account(provider_subject,status) values (subject,'active') returning id into result;
  return result;
end
$$;

create function app.application_view(item app.teacher_application) returns jsonb
language sql stable set search_path = pg_catalog
as $$
  select jsonb_build_object('id', item.id, 'state', item.state, 'revision', item.revision,
    'displayName', item.display_name, 'requestedSubjects', item.requested_subjects,
    'correspondenceLocale', item.correspondence_locale,
    'submittedAt', app.utc_iso(item.submitted_at), 'decidedAt', app.utc_iso(item.decided_at),
    'applicantMessage', item.applicant_message)
    || case when item.work_contact is null then '{}'::jsonb else jsonb_build_object('workContact',item.work_contact) end
$$;

create function app.my_application(subject uuid, auth_session uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare owner uuid;
begin
  owner := app.applicant_identity(subject, auth_session, false);
  if owner is null then raise exception 'Invalid applicant session' using errcode = '42501'; end if;
  return (select app.application_view(a) from app.teacher_application a where a.applicant_id = owner);
end
$$;

create function app.submit_application(subject uuid, auth_session uuid, fields jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare owner uuid; result app.teacher_application%rowtype;
begin
  owner := app.applicant_identity(subject, auth_session, true);
  if owner is null then raise exception 'Invalid applicant session' using errcode = '42501'; end if;
  select * into result from app.teacher_application where applicant_id = owner;
  if found then return app.application_view(result); end if;
  if 'teacher' = any(app.active_personas(owner)) then
    raise exception 'Teaching access exists' using errcode = '23505';
  end if;
  insert into app.teacher_application(applicant_id, display_name, work_contact, requested_subjects, correspondence_locale)
    values (owner, fields ->> 'displayName', fields ->> 'workContact',
      array(select jsonb_array_elements_text(coalesce(fields -> 'requestedSubjects', '[]'))), fields ->> 'correspondenceLocale')
    returning * into result;
  return app.application_view(result);
end
$$;

create function app.decide_application(target uuid, expected integer, result_state text, message text)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare current app.teacher_application%rowtype;
begin
  if not app.has_capability('applications.manage') then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  select * into current from app.teacher_application where id = target for update;
  if not found then return null; end if;
  if current.applicant_id = app.actor_account() then raise exception 'Access denied' using errcode = '42501'; end if;
  if current.revision <> expected then return jsonb_build_object('stale', true); end if;
  if current.state <> 'submitted' or result_state not in ('approved','declined') then
    raise exception 'Invalid application decision' using errcode = '23505';
  end if;
  if result_state = 'approved' then
    if not exists(select 1 from app.account a where a.id = current.applicant_id and a.status = 'active') then
      raise exception 'Applicant account is disabled' using errcode = '23505';
    end if;
    insert into app.persona_grant as g(account_id,persona) values (current.applicant_id,'teacher')
    on conflict on constraint persona_grant_pkey do update set revoked_at = null, effective_at = now(), expires_at = null
    where g.revoked_at is not null or (g.expires_at is not null and g.expires_at <= now());
    update app.account set authorization_revision = authorization_revision + 1 where id = current.applicant_id;
  end if;
  update app.teacher_application set state = result_state, applicant_message = message, decided_at = now(),
    decided_by = app.actor_account(), revision = revision + 1 where id = target returning * into current;
  return app.application_view(current) || jsonb_build_object('applicantId', current.applicant_id);
end
$$;

revoke all on function app.record_applicant_intake(text,text), app.applicant_can_activate(uuid,uuid),
  app.applicant_identity(uuid,uuid,boolean), app.application_view(app.teacher_application), app.my_application(uuid,uuid),
  app.submit_application(uuid,uuid,jsonb), app.decide_application(uuid,integer,text,text)
from public, anon, authenticated, service_role;
grant execute on function app.record_applicant_intake(text,text), app.applicant_can_activate(uuid,uuid),
  app.applicant_identity(uuid,uuid,boolean), app.application_view(app.teacher_application), app.my_application(uuid,uuid),
  app.submit_application(uuid,uuid,jsonb), app.decide_application(uuid,integer,text,text) to app_runtime;
