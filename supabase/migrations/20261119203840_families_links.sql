create sequence app.student_number_seq as bigint no cycle;
create function app.allocate_student_number() returns text
language sql volatile set search_path = pg_catalog
as $$
  select 'MA-' || lpad(number::text, greatest(6, length(number::text)), '0')
  from nextval('app.student_number_seq'::regclass) number
$$;

create table app.student (
  id uuid primary key default gen_random_uuid(),
  student_number text not null unique default app.allocate_student_number(),
  source_namespace text,
  external_key text,
  display_name text not null check (char_length(display_name) between 1 and 200),
  state text not null default 'active' check (state in ('active','inactive')),
  revision integer not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  check ((source_namespace is null) = (external_key is null)),
  unique (source_namespace, external_key)
);

create table app.guardian_profile (
  id uuid primary key default gen_random_uuid(),
  account_id uuid unique references app.account,
  source_namespace text,
  external_key text,
  display_name text not null check (char_length(display_name) between 1 and 200),
  contact_email text check (contact_email is null or (contact_email = lower(btrim(contact_email)) and char_length(contact_email) <= 254)),
  contact_phone text check (contact_phone is null or char_length(contact_phone) <= 48),
  correspondence_locale text not null check (correspondence_locale in ('ar', 'de')),
  revision integer not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  check ((source_namespace is null) = (external_key is null)),
  unique (source_namespace, external_key)
);

create table app.child_link (
  id uuid primary key default gen_random_uuid(),
  guardian_id uuid not null references app.guardian_profile,
  student_id uuid not null references app.student,
  state text not null default 'pending' check (state in ('pending', 'approved', 'revoked')),
  effective_from timestamptz,
  effective_until timestamptz,
  created_at timestamptz not null default now(),
  changed_by uuid not null references app.account,
  revision integer not null default 1 check (revision >= 1),
  reason text not null default '' check (char_length(reason) <= 400),
  check (state <> 'approved' or effective_from is not null),
  check (state <> 'revoked' or effective_until is not null),
  check (effective_until is null or effective_from is null or effective_until >= effective_from)
);
create unique index one_current_child_relationship on app.child_link (guardian_id, student_id) where state <> 'revoked';
create index child_link_student_idx on app.child_link(student_id);

create table app.child_link_change (
  link_id uuid not null references app.child_link,
  revision integer not null,
  state text not null,
  actor_id uuid not null references app.account,
  reason text not null,
  occurred_at timestamptz not null default now(),
  primary key (link_id, revision)
);

create function app.protect_student_identity() returns trigger
language plpgsql set search_path = pg_catalog
as $$
begin
  if new.student_number is distinct from old.student_number
    or new.source_namespace is distinct from old.source_namespace or new.external_key is distinct from old.external_key
  then raise exception 'Student identifiers are immutable' using errcode = '23514'; end if;
  return new;
end
$$;
create trigger protect_student_identity before update on app.student
for each row execute function app.protect_student_identity();

create function app.record_link_revision() returns trigger
language plpgsql security definer set search_path = pg_catalog
as $$
begin
  if tg_op = 'UPDATE' and (old.state = 'revoked' or new.guardian_id <> old.guardian_id or new.student_id <> old.student_id
    or new.revision <> old.revision + 1) then
    raise exception 'Invalid relationship revision' using errcode = '23514';
  end if;
  insert into app.child_link_change(link_id, revision, state, actor_id, reason)
    values (new.id, new.revision, new.state, new.changed_by, new.reason);
  return new;
end
$$;
create trigger record_link_revision after insert or update on app.child_link
for each row execute function app.record_link_revision();

create function app.has_child_link(child uuid) returns boolean
language sql stable security definer set search_path = pg_catalog
as $$
  select app.actor_persona() = 'guardian' and exists (
    select 1 from app.child_link l join app.guardian_profile g on g.id = l.guardian_id
    where g.account_id = app.actor_account() and l.student_id = child and l.state = 'approved'
      and l.effective_from <= now() and (l.effective_until is null or l.effective_until > now())
  )
$$;

alter table app.student enable row level security;
alter table app.guardian_profile enable row level security;
alter table app.child_link enable row level security;
alter table app.child_link_change enable row level security;
grant select, insert, update on app.student, app.guardian_profile, app.child_link to app_runtime;
grant usage on sequence app.student_number_seq to app_runtime;

create policy student_office on app.student for all to app_runtime
using ((select app.has_capability('students.manage'))) with check ((select app.has_capability('students.manage')));
create policy student_guardian on app.student for select to app_runtime using (app.has_child_link(id));
create policy guardian_office on app.guardian_profile for all to app_runtime
using ((select app.has_capability('students.manage'))) with check ((select app.has_capability('students.manage')));
create policy link_office on app.child_link for all to app_runtime
using ((select app.has_capability('students.manage'))) with check ((select app.has_capability('students.manage')));

revoke all on function app.allocate_student_number(), app.protect_student_identity(), app.record_link_revision(),
  app.has_child_link(uuid) from public, anon, authenticated, service_role;
grant execute on function app.allocate_student_number(), app.has_child_link(uuid) to app_runtime;
