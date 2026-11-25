-- School-wide direct communication. Preserve all academic, finance, publication,
-- office-case and participant-specific reference checks. Existing UUIDs are stable.
-- Active admin grants may predate staff profiles (notably the original Hauptadmin).
create or replace function app.contact_account_active(target uuid,persona_key text)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
  select exists(
    select 1 from app.account a where a.id=target and a.status='active'
      and persona_key=any(app.active_personas(a.id)::text[])
      and case persona_key
        when 'guardian' then exists(select 1 from app.guardian_profile g where g.account_id=a.id)
        when 'teacher' then exists(select 1 from app.staff_profile p where p.account_id=a.id
          and p.role='teacher' and app.profile_active_at(p,app.school_today()))
        when 'admin' then (
          exists(select 1 from app.staff_profile p where p.account_id=a.id
            and p.role<>'teacher' and app.profile_active_at(p,app.school_today()))
          or not exists(select 1 from app.staff_profile p where p.account_id=a.id)
        )
        else false end
  )
$$;

create or replace function app.contact_name(target uuid,persona_key text)
returns text language sql stable security definer set search_path=pg_catalog
as $$
  select case when persona_key='guardian' then
    (select g.display_name from app.guardian_profile g where g.account_id=target)
  else coalesce(
    (select p.display_name from app.staff_profile p where p.account_id=target),
    case when persona_key='admin' and app.contact_account_active(target,'admin')
      then case when target=app.hauptadmin_account_id() then 'Hauptadmin' else 'Admin' end end
  ) end
$$;

-- This predicate authorizes only direct-chat relationships, not access to school records.
-- Both endpoints must remain active and verified; never authorize self-messaging.
create or replace function app.directory_relationship_allowed(initiator uuid,initiator_persona text,partner uuid,partner_persona text)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
  select coalesce(initiator<>partner and app.contact_account_active(initiator,initiator_persona)
    and app.contact_account_active(partner,partner_persona)
    and (select count(*)=2 from app.account a join auth.users u on u.id=a.provider_subject
      where a.id in (initiator,partner) and u.email_confirmed_at is not null and u.deleted_at is null
        and (u.banned_until is null or u.banned_until<=now())),false)
$$;

create or replace function app.directory_contacts()
returns table(id text,account_id uuid,target_persona app.persona,role text,display_name text,
  title_ar text,title_de text,work_email text,work_phone text,contexts jsonb)
language sql stable security definer set search_path=pg_catalog
as $$
  with today as (select app.school_today() as day),
  -- Existing publication rules for professional email/phone are retained:
  -- opening the directory to all does not expose additional contact details.
  old_details as (select * from app.staff_contact_candidates()),
  candidates as (
    select p.id,p.account_id,p.display_name,p.role,p.title_ar,p.title_de,o.work_email,o.work_phone,
      case when p.role='teacher' then 'teacher' else 'admin' end::app.persona as target_persona
    from app.staff_profile p left join old_details o on o.id=p.id and o.account_id=p.account_id
    union all
    select g.id,g.account_id,g.display_name,'guardian','ولي أمر','Eltern',null,null,'guardian'::app.persona
    from app.guardian_profile g
    union all
    select a.id,a.id,app.contact_name(a.id,'admin'),'admin','إدارة المدرسة','Administration',null,null,'admin'::app.persona
    from app.account a
    where app.contact_account_active(a.id,'admin')
      and not exists(select 1 from app.staff_profile p where p.account_id=a.id)
  ),
  eligible as (
    select p.* from candidates p
    where app.directory_relationship_allowed(app.actor_account(),app.actor_persona()::text,p.account_id,p.target_persona::text)
  )
  select p.id::text,p.account_id,p.target_persona,p.role,p.display_name,p.title_ar,p.title_de,p.work_email,p.work_phone,
    coalesce((
      select jsonb_agg(jsonb_build_object('id',c.id,'nameAr',c.name_ar,'nameDe',c.name_de) order by c.code,c.id)
      from app.school_class c
      where (app.actor_persona()='guardian' and p.target_persona='teacher' and exists(
        select 1 from app.enrollment e
        where e.class_id=c.id and e.voided_at is null and today.day>=e.effective_from and today.day<e.effective_until
          and app.has_child_link(e.student_id)
          and exists(select 1 from app.teaching_assignment t where t.class_id=c.id and app.teacher_applies(t.id,p.id,today.day))
      )) or (app.actor_persona()='teacher' and p.target_persona='guardian'
        and app.teacher_scope(c.id,today.day,'comms.class') and exists(
          select 1 from app.child_link l join app.enrollment e on e.student_id=l.student_id
          where l.guardian_id=p.id and l.state='approved' and l.effective_from<=now()
            and (l.effective_until is null or now()<l.effective_until) and e.class_id=c.id
            and e.voided_at is null and today.day>=e.effective_from and today.day<e.effective_until
        ))
    ),'[]'::jsonb)
  from eligible p cross join today
  union all
  -- Keep legacy office descriptors so previously installed clients and invoice/
  -- attendance deep links continue to work. New ordinary compose uses persons.
  select o.code,null,null,'office',null,o.ar,o.de,null,null,'[]'::jsonb
  from (values ('student_affairs','شؤون الطلبة','Schulbüro'),('accounts','الحسابات','Buchhaltung')) o(code,ar,de)
  where app.actor_persona() is not null and exists(
    select 1 from app.inbox_grant g join app.account a on a.id=g.account_id
    where g.inbox=o.code and g.revoked_at is null and now()>=g.valid_from
      and (g.valid_until is null or now()<g.valid_until)
      and a.status='active' and 'admin'=any(app.active_personas(a.id))
  )
$$;
