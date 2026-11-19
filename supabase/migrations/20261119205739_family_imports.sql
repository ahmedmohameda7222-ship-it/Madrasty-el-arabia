create table app.family_import_job (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references app.account,
  file_name text not null check (char_length(file_name) between 1 and 180),
  file_mime text not null check (file_mime in ('text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')),
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  source_bytes bytea check (source_bytes is null or octet_length(source_bytes) between 1 and 2500000),
  state text not null default 'uploaded' check (state in ('uploaded','review','committed')),
  mapping jsonb,
  revision integer not null default 1 check (revision >= 1),
  expires_at timestamptz not null default now() + interval '24 hours',
  created_at timestamptz not null default now(),
  receipt jsonb,
  check ((state = 'committed') = (receipt is not null)),
  check (state <> 'committed' or source_bytes is null)
);

create index family_import_expiry_idx on app.family_import_job(expires_at) where state <> 'committed';

create table app.family_import_row (
  job_id uuid not null references app.family_import_job on delete cascade,
  row_no integer not null check (row_no > 0),
  fields jsonb,
  disposition text not null check (disposition in ('new','existing','duplicate','conflict','revoked','skipped')),
  failure_code text,
  failure_column text,
  decision text check (decision in ('approve','skip','restore','match_guardian','match_student')),
  guardian_id uuid references app.guardian_profile,
  guardian_revision integer,
  student_id uuid references app.student,
  student_revision integer,
  link_id uuid references app.child_link,
  link_revision integer,
  matched_override uuid,
  payer_override boolean,
  primary key (job_id, row_no)
);

create table app.family_import_recipient (
  job_id uuid not null references app.family_import_job,
  guardian_id uuid not null references app.guardian_profile,
  created_at timestamptz not null default now(),
  primary key (job_id, guardian_id)
);

create table app.family_payer_candidate (
  student_id uuid not null references app.student,
  guardian_id uuid not null references app.guardian_profile,
  proposed_by uuid not null references app.account,
  origin_job_id uuid not null references app.family_import_job,
  created_at timestamptz not null default now(),
  primary key (student_id, guardian_id)
);

alter table app.family_import_job enable row level security;
alter table app.family_import_row enable row level security;
alter table app.family_import_recipient enable row level security;
alter table app.family_payer_candidate enable row level security;

grant select, insert, update on app.family_import_job, app.family_import_recipient to app_runtime;
grant select, insert, update, delete on app.family_import_row to app_runtime;
grant select, insert on app.family_payer_candidate to app_runtime;

create policy family_import_job_owner on app.family_import_job for all to app_runtime
using ((select app.has_capability('students.manage')) and owner_id = (select app.actor_account())
  and (state = 'committed' or expires_at > now()))
with check ((select app.has_capability('students.manage')) and owner_id = (select app.actor_account())
  and (state = 'committed' or expires_at > now()));
create policy family_import_row_read on app.family_import_row for select to app_runtime
using (exists(select 1 from app.family_import_job j where j.id = job_id));
create policy family_import_row_owner on app.family_import_row for all to app_runtime
using (exists(select 1 from app.family_import_job j where j.id = job_id and j.state <> 'committed'))
with check (exists(select 1 from app.family_import_job j where j.id = job_id and j.state <> 'committed'));
create policy family_import_recipient_owner on app.family_import_recipient for all to app_runtime
using (exists(select 1 from app.family_import_job j where j.id = job_id and j.state = 'committed'))
with check (exists(select 1 from app.family_import_job j where j.id = job_id));
create policy payer_candidate_office on app.family_payer_candidate for all to app_runtime
using ((select app.has_capability('students.manage')))
with check ((select app.has_capability('students.manage')) and proposed_by = (select app.actor_account()));

-- C06's scheduler provisions the restricted owner job for expiring uncommitted files.
-- B02 consumes proposals individually after reviewing the existing named payer.
