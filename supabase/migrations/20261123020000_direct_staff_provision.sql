-- Directly provision Admin and Lehrkraft accounts, preserving the original Hauptadmin.
set local search_path = pg_catalog, public, extensions;

-- Internal legacy designations are consolidated as Administration, without deleting profiles.
update app.staff_profile set role = 'admin', revision = revision + 1
where role in ('principal','deputy','office');
alter table app.staff_profile drop constraint if exists staff_profile_role_check;
alter table app.staff_profile add constraint staff_profile_role_check check (role in ('teacher','admin'));

create function app.hauptadmin_account_id() returns uuid
language sql stable security definer set search_path = pg_catalog
as $$
  select b.account_id from app.initial_admin b
  where lower(b.submitted_email) = 'madrastyelarabia@hotmail.com'
    and b.activated_at is not null
  order by b.account_id limit 1
$$;

create function app.is_hauptadmin() returns boolean
language sql stable security definer set search_path = pg_catalog
as $$
  select coalesce(app.actor_persona() = 'admin'
    and app.actor_account() = app.hauptadmin_account_id()
    and app.has_capability('access.manage'), false)
$$;

create function app.can_provision_staff_account(requested_role text) returns boolean
language sql stable security definer set search_path = pg_catalog
as $$
  select coalesce(
    app.actor_persona() = 'admin'
    and current_setting('app.assurance', true) = 'aal2'
    and case requested_role
      when 'admin' then app.is_hauptadmin()
      when 'teacher' then (
        app.is_hauptadmin()
        or app.has_capability('school.manage')
        or app.has_capability('academics.supervise')
        or app.has_capability('staff.invite')
      )
      else false end, false)
$$;

create function app.provision_staff_account(
  provider_user uuid, user_name text, user_email text, user_phone text,
  requested_role text, contact_locale text, requested_capabilities text[]
)
returns table(account_id uuid, staff_id uuid)
language plpgsql security definer set search_path = pg_catalog
as $$
declare new_account uuid; new_staff uuid; valid_caps text[];
begin
  if not app.can_provision_staff_account(requested_role) then
    raise exception 'Access denied' using errcode='42501';
  end if;
  if provider_user is null or user_name is null or length(btrim(user_name)) not between 1 and 200
    or user_email is null or user_email <> lower(btrim(user_email)) or contact_locale not in ('ar','de')
    or cardinality(requested_capabilities) > 12 then
    raise exception 'Invalid staff details' using errcode='23514';
  end if;
  if not exists(
    select 1 from auth.users u where u.id = provider_user and lower(u.email) = user_email
      and u.email_confirmed_at is not null and u.deleted_at is null
  ) then raise exception 'Provider account mismatch' using errcode='23514'; end if;
  valid_caps := array[
    'school.manage','students.manage','staff.invite','attendance.supervise',
    'academics.supervise','comms.publish','finance.read','finance.issue',
    'finance.post','finance.export','bank.configure','audit.read'
  ]::text[];
  if (requested_role = 'teacher' and cardinality(requested_capabilities) > 0)
    or not (requested_capabilities <@ valid_caps)
    or cardinality(requested_capabilities) <> (
      select count(distinct key) from unnest(requested_capabilities) cap(key)
    ) then raise exception 'Invalid requested capability' using errcode='23514'; end if;

  insert into app.account(provider_subject,status) values(provider_user,'active') returning id into new_account;
  insert into app.persona_grant(account_id,persona)
    values(new_account,requested_role::app.persona);

  insert into app.staff_profile(account_id,display_name,role,title_ar,title_de,
    work_email,work_phone,active_from)
  values(new_account,user_name,requested_role,
    case requested_role when 'teacher' then 'مدرس' else 'إدارة' end,
    case requested_role when 'teacher' then 'Lehrkraft' else 'Administration' end,
    user_email,user_phone,coalesce(app.school_today(),current_date))
  returning id into new_staff;

  if requested_role = 'teacher' then
    insert into app.teacher_invite_contact(email,display_name,correspondence_locale,account_id)
    values(user_email,user_name,contact_locale,new_account)
    on conflict(email) do update
      set account_id=excluded.account_id,display_name=excluded.display_name
      where app.teacher_invite_contact.account_id is null;
  else
    insert into app.capability_grant(account_id,capability,valid_from,valid_until)
    select new_account,cap,now(),null from unnest(requested_capabilities) c(cap);
  end if;
  return query select new_account,new_staff;
end
$$;

-- Even if an older privileged endpoint is called, it cannot mint or revoke Admin
-- identities or disable the original Hauptadmin.
create function app.guard_hauptadmin_persona() returns trigger
language plpgsql security definer set search_path = pg_catalog
as $$
declare before_role app.persona; after_role app.persona; target uuid;
begin
  if tg_op = 'INSERT' then
    before_role := null; after_role := new.persona; target := new.account_id;
  elsif tg_op = 'DELETE' then
    before_role := old.persona; after_role := null; target := old.account_id;
  else
    before_role := old.persona; after_role := new.persona; target := old.account_id;
  end if;
  if target = app.hauptadmin_account_id() and before_role = 'admin'
    and (tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.revoked_at is not null))
  then raise exception 'The Hauptadmin cannot be removed' using errcode='42501'; end if;
  if (before_role = 'admin' or after_role = 'admin')
    and app.actor_account() is not null and not app.is_hauptadmin()
  then raise exception 'Only the Hauptadmin can modify Admin roles' using errcode='42501'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;
create trigger guard_hauptadmin_persona
before insert or update or delete on app.persona_grant
for each row execute function app.guard_hauptadmin_persona();

create function app.guard_hauptadmin_status() returns trigger
language plpgsql security definer set search_path = pg_catalog
as $$
begin
  if old.id = app.hauptadmin_account_id() and new.status <> 'active'
  then raise exception 'Cannot disable Hauptadmin account' using errcode='42501'; end if;
  return new;
end
$$;
create trigger guard_hauptadmin_status before update of status on app.account
for each row execute function app.guard_hauptadmin_status();

revoke all on function app.hauptadmin_account_id(),app.is_hauptadmin(),
  app.can_provision_staff_account(text),
  app.provision_staff_account(uuid,text,text,text,text,text,text[])
from public,anon,authenticated,service_role;
grant execute on function app.hauptadmin_account_id(),app.is_hauptadmin(),
  app.can_provision_staff_account(text),
  app.provision_staff_account(uuid,text,text,text,text,text,text[])
to app_runtime;
