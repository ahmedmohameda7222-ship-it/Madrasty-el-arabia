-- Organizational membership is not an access grant. Existing child_link remains authoritative.
create table app.family_group (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 200),
  import_key text unique check (char_length(btrim(import_key)) between 1 and 160),
  situation text not null default 'unknown' check (situation in ('unknown','together','separated','divorced','single','other')),
  revision integer not null default 1 check (revision >= 1),
  created_at timestamptz not null default now()
);
create table app.family_group_guardian (
  family_id uuid not null references app.family_group,
  guardian_id uuid not null references app.guardian_profile,
  primary key (family_id,guardian_id)
);
create table app.family_group_student (
  family_id uuid not null references app.family_group,
  student_id uuid not null references app.student,
  primary key (family_id,student_id)
);
create index family_group_guardian_person_idx on app.family_group_guardian(guardian_id);
create index family_group_student_person_idx on app.family_group_student(student_id);
-- Relationship description is informational only; it cannot grant access.
alter table app.child_link add column relationship text not null default 'unspecified'
  check (relationship in ('unspecified','father','mother','legal','other'));
alter table app.family_group enable row level security;
alter table app.family_group_guardian enable row level security;
alter table app.family_group_student enable row level security;
revoke all on app.family_group,app.family_group_guardian,app.family_group_student from public,anon,authenticated,service_role;
grant select,insert,update on app.family_group to app_runtime;
grant select,insert on app.family_group_guardian,app.family_group_student to app_runtime;
create policy family_group_office on app.family_group for all to app_runtime
  using ((select app.has_capability('students.manage'))) with check ((select app.has_capability('students.manage')));
create policy family_group_guardian_office on app.family_group_guardian for all to app_runtime
  using ((select app.has_capability('students.manage'))) with check ((select app.has_capability('students.manage')));
create policy family_group_student_office on app.family_group_student for all to app_runtime
  using ((select app.has_capability('students.manage'))) with check ((select app.has_capability('students.manage')));
