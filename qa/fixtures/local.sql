\set ON_ERROR_STOP on

create schema if not exists qa;
create table if not exists qa.actor (
  run_id text not null check (run_id ~ '^qa-[0-9a-f]{32}$'),
  principal text not null check (principal ~ '^[a-z][a-z0-9-]{0,23}$'),
  account_id uuid not null unique references app.account,
  primary key (run_id, principal)
);

create or replace function qa.seed_actor(run text, name text, subject uuid)
returns uuid language plpgsql security definer set search_path = pg_catalog
as $$
declare
  account uuid;
  capabilities text[];
begin
  if run !~ '^qa-[0-9a-f]{32}$' or not exists (
    select 1 from auth.users u where u.id = subject
      and u.email = run || '.' || name || '@madrasty.invalid'
      and u.email_confirmed_at is not null
  ) then raise exception 'Expected a confirmed synthetic QA identity'; end if;
  if name not in ('admin', 'admin-two', 'office', 'finance', 'supervisor', 'teacher', 'teacher-other',
    'substitute', 'dual-role', 'guardian-ar', 'guardian-de', 'guardian-other') then
    raise exception 'Unknown QA principal';
  end if;

  insert into app.account (provider_subject, status) values (subject, 'active') returning id into account;
  insert into qa.actor values (run, name, account);

  if name in ('admin', 'admin-two', 'office', 'finance', 'supervisor') then
    insert into app.persona_grant (account_id, persona) values (account, 'admin');
  end if;
  if name in ('teacher', 'teacher-other', 'substitute', 'dual-role') then
    insert into app.persona_grant (account_id, persona) values (account, 'teacher');
    insert into app.staff_profile (account_id, display_name, role, title_ar, title_de, active_from)
      values (account, case name
        when 'teacher' then 'يوسف عبد الرحمن محمود'
        when 'teacher-other' then 'Johannes Peter Schneider'
        when 'substitute' then 'ليلى مراد'
        when 'dual-role' then 'محمود صالح'
      end, 'teacher', 'مدرس', 'Lehrkraft', '2026-01-01');
  end if;
  if name in ('guardian-ar', 'guardian-de', 'guardian-other', 'dual-role') then
    insert into app.persona_grant (account_id, persona) values (account, 'guardian');
    insert into app.guardian_profile (account_id, source_namespace, external_key, display_name, contact_email, correspondence_locale)
      values (account, run, name, case name
          when 'guardian-ar' then 'سلمى عبد الرحمن محمد'
          when 'guardian-de' then 'Johanna Marie Sophie von Hohenlohe-Langenburg-Wiśniewska-Kowalczyk'
          when 'guardian-other' then 'أمينة'
          when 'dual-role' then 'محمود صالح'
        end, run || '.' || name || '@madrasty.invalid',
        case when name = 'guardian-ar' then 'ar' else 'de' end);
  end if;
  if name in ('admin', 'admin-two') then
    insert into app.access_administrator (account_id) values (account);
  end if;
  capabilities := case name
    when 'admin' then array['bank.configure']
    when 'office' then array['students.manage', 'staff.invite']
    when 'finance' then array['finance.read', 'finance.issue', 'finance.post', 'finance.export']
    when 'supervisor' then array['attendance.supervise', 'academics.supervise']
    else '{}'::text[]
  end;
  insert into app.capability_grant (account_id, capability, valid_from)
    select account, capability, now() from unnest(capabilities) assigned(capability);
  if name in ('office', 'finance') then
    insert into app.inbox_grant (account_id, inbox, valid_from)
    values (account, case when name = 'office' then 'student_affairs' else 'accounts' end, now());
  end if;
  return account;
end;
$$;

create or replace function qa.seed_family(run text)
returns table (child_key text, child_id uuid) language plpgsql security definer set search_path = pg_catalog
as $$
declare
  admin uuid;
begin
  select account_id into strict admin from qa.actor where run_id = run and principal = 'admin';
  insert into app.student (source_namespace, external_key, display_name)
    select run, supplied.name, supplied.label
    from (values
      ('ahmed', 'عبد الرحمن محمد أحمد إبراهيم مصطفى عبد الله السيد محمود عبد العزيز حسن عبد المنعم علي أبو زيد'),
      ('omar', 'نور'),
      ('other', 'Johanna Marie Sophie von Hohenlohe-Langenburg-Wiśniewska-Kowalczyk'),
      ('revoked', 'مريم')) supplied(name, label);
  insert into app.child_link (guardian_id, student_id, state, effective_from, effective_until, changed_by)
    select g.id, s.id, link.state, now() - interval '30 days',
      case when link.state = 'revoked' then now() - interval '1 day' else null end, admin
    from (values ('guardian-ar', 'ahmed', 'approved'), ('guardian-ar', 'omar', 'approved'),
      ('guardian-de', 'ahmed', 'approved'), ('dual-role', 'ahmed', 'approved'),
      ('guardian-other', 'other', 'approved'), ('guardian-ar', 'revoked', 'revoked')) link(principal, pupil, state)
    join app.guardian_profile g on g.source_namespace = run and g.external_key = link.principal
    join app.student s on s.source_namespace = run and s.external_key = link.pupil;
  return query select s.external_key, s.id from app.student s where s.source_namespace = run;
end;
$$;

create or replace function qa.purge_unused_run(run text)
returns table (provider_subject uuid) language plpgsql security definer set search_path = pg_catalog
as $$
begin
  if run !~ '^qa-[0-9a-f]{32}$' or not exists (select 1 from qa.actor where run_id = run) then
    raise exception 'Expected a registered synthetic QA run';
  end if;
  -- A used run may have permanent domain/audit history. Foreign keys abort the
  -- whole transaction if the fixtures were used for business writes.
  delete from app.child_link_change where link_id in (
    select l.id from app.child_link l join app.guardian_profile g on g.id = l.guardian_id where g.source_namespace = run);
  delete from app.child_link where guardian_id in (select id from app.guardian_profile where source_namespace = run)
    and student_id in (select id from app.student where source_namespace = run);
  delete from app.guardian_profile where source_namespace = run;
  delete from app.student where source_namespace = run;
  delete from app.staff_profile where account_id in (select account_id from qa.actor where run_id = run);
  delete from app.access_administrator where account_id in (select account_id from qa.actor where run_id = run);
  delete from app.capability_grant where account_id in (select account_id from qa.actor where run_id = run);
  delete from app.inbox_grant where account_id in (select account_id from qa.actor where run_id = run);
  delete from app.mfa_challenge where session_id in (select provider_session_id from app.session_binding
    where account_id in (select account_id from qa.actor where run_id = run));
  delete from app.session_binding where account_id in (select account_id from qa.actor where run_id = run);
  delete from app.persona_grant where account_id in (select account_id from qa.actor where run_id = run);
  return query with fixtures as (delete from qa.actor where run_id = run returning account_id)
    delete from app.account a using fixtures where a.id = fixtures.account_id returning a.provider_subject;
end;
$$;

create or replace function qa.read_run(run text)
returns table (principal text, ref uuid) language sql security definer set search_path = pg_catalog
as $$
  select name.principal, name.account_id from qa.actor name where name.run_id = run
  union all
  select s.external_key, s.id from app.student s where s.source_namespace = run
$$;

create or replace function qa.expire_session(run text, target uuid)
returns boolean language sql security definer set search_path = pg_catalog
as $$
  with expired as (
    update auth.sessions s set not_after = now() - interval '1 second'
    where s.id = target and exists (
      select 1 from qa.actor f join app.account a on a.id = f.account_id
      where f.run_id = run and a.provider_subject = s.user_id
    ) returning 1
  )
  select exists(select 1 from expired)
$$;

revoke all on schema qa from public;
revoke all on all functions in schema qa from public;
grant usage on schema qa to madrasty_qa_fixture;
grant execute on function qa.seed_actor(text,text,uuid), qa.seed_family(text), qa.purge_unused_run(text), qa.read_run(text) to madrasty_qa_fixture;
grant execute on function qa.expire_session(text,uuid) to madrasty_qa_fixture;
