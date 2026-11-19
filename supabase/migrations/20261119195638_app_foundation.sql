create role app_runtime nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create schema app;
revoke all on schema app from public, anon, authenticated, service_role;
grant usage on schema app to app_runtime;

alter default privileges in schema app revoke all on tables from public, anon, authenticated, service_role;
alter default privileges in schema app revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges revoke execute on functions from public;
alter default privileges in schema app revoke execute on functions from anon, authenticated, service_role;

create type app.persona as enum ('admin', 'teacher', 'guardian');
revoke all on type app.persona from public;
grant usage on type app.persona to app_runtime;

create function app.actor_account() returns uuid
language sql stable set search_path = pg_catalog
as $$ select nullif(current_setting('app.account_id', true), '')::uuid $$;

create function app.actor_session() returns uuid
language sql stable set search_path = pg_catalog
as $$ select nullif(current_setting('app.session_id', true), '')::uuid $$;

create function app.actor_persona() returns app.persona
language sql stable set search_path = pg_catalog
as $$ select nullif(current_setting('app.persona', true), '')::app.persona $$;

create function app.actor_request() returns uuid
language sql stable set search_path = pg_catalog
as $$ select nullif(current_setting('app.request_id', true), '')::uuid $$;

revoke all on all functions in schema app from public, anon, authenticated, service_role;
grant execute on function app.actor_account(), app.actor_session(), app.actor_persona(), app.actor_request()
to app_runtime;

create table app.command_receipt (
  account_id uuid not null,
  persona app.persona not null,
  operation text not null check (char_length(operation) between 1 and 120),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9._~-]{1,128}$'),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  result jsonb not null,
  committed_at timestamptz not null default now(),
  primary key (account_id, persona, operation, idempotency_key)
);

alter table app.command_receipt enable row level security;
alter table app.command_receipt force row level security;
grant select, insert on app.command_receipt to app_runtime;
create policy receipt_read on app.command_receipt for select to app_runtime
  using (account_id = (select app.actor_account()) and persona = (select app.actor_persona()));
create policy receipt_write on app.command_receipt for insert to app_runtime
  with check (account_id = (select app.actor_account()) and persona = (select app.actor_persona()));

create table app.audit_entry (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  persona app.persona not null,
  request_id uuid not null,
  action text not null,
  aggregate_id uuid not null,
  metadata jsonb not null default '{}' check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now()
);
create index audit_entry_time_idx on app.audit_entry (occurred_at desc, id desc);
alter table app.audit_entry enable row level security;
alter table app.audit_entry force row level security;
grant insert on app.audit_entry to app_runtime;
create policy audit_write on app.audit_entry for insert to app_runtime
  with check (actor_id = (select app.actor_account()) and persona = (select app.actor_persona())
    and request_id = (select app.actor_request()));

create table app.outbox_event (
  id uuid primary key,
  type text not null check (type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  occurred_at timestamptz not null,
  actor_id uuid not null,
  aggregate_id uuid not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object')
);
create index outbox_event_time_idx on app.outbox_event (occurred_at, id);
alter table app.outbox_event enable row level security;
alter table app.outbox_event force row level security;
grant insert on app.outbox_event to app_runtime;
create policy outbox_write on app.outbox_event for insert to app_runtime
  with check (actor_id = (select app.actor_account()) and (select app.actor_persona()) is not null);
