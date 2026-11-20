create table app.thread (
  id uuid primary key default gen_random_uuid(),
  kind text not null check(kind in ('direct','office')),
  opened_by uuid not null references app.account,
  opened_persona text not null check(opened_persona in ('admin','teacher','guardian')),
  pair_first uuid references app.account,
  pair_second uuid references app.account,
  persona_first text,
  persona_second text,
  created_at timestamptz not null default now(),
  check(
    (kind='direct' and pair_first is not null and pair_second is not null and pair_first<pair_second
      and persona_first in ('admin','teacher','guardian') and persona_second in ('admin','teacher','guardian'))
    or (kind='office' and pair_first is null and pair_second is null and persona_first is null and persona_second is null)
  )
);
create unique index thread_direct_pair_idx on app.thread(pair_first,persona_first,pair_second,persona_second) where kind='direct';

create table app.thread_participant (
  thread_id uuid not null references app.thread,
  account_id uuid not null references app.account,
  persona text not null check(persona in ('admin','teacher','guardian')),
  joined_at timestamptz not null default now(),
  primary key(thread_id,account_id,persona)
);
create index thread_participant_account_idx on app.thread_participant(account_id,persona,thread_id);

create table app.office_case (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null unique references app.thread,
  requester_id uuid not null references app.account,
  requester_persona text not null check(requester_persona in ('admin','teacher','guardian')),
  inbox text not null check(inbox in ('student_affairs','accounts')),
  origin_kind text check(origin_kind in ('attendance','invoice')),
  origin_id uuid,
  status text not null default 'open' check(status in ('open','in_progress','closed')),
  assignee_id uuid references app.account,
  revision integer not null default 1 check(revision>=1),
  updated_at timestamptz not null default now(),
  unique nulls not distinct(requester_id,requester_persona,inbox,origin_kind,origin_id),
  check((origin_kind is null)=(origin_id is null)),
  check(origin_kind is null or (origin_kind='attendance' and inbox='student_affairs') or (origin_kind='invoice' and inbox='accounts'))
);
create index office_case_inbox_idx on app.office_case(inbox,status,updated_at desc,id);

create table app.thread_reference (
  thread_id uuid not null references app.thread,
  reference_kind text not null check(reference_kind in ('homework','invoice','attendance')),
  reference_id uuid not null,
  added_by uuid not null references app.account,
  added_at timestamptz not null default now(),
  primary key(thread_id,reference_kind,reference_id)
);

alter table app.thread enable row level security;
alter table app.thread_participant enable row level security;
alter table app.office_case enable row level security;
alter table app.thread_reference enable row level security;

create function app.contact_account_active(target uuid,persona_key text)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
  select exists(select 1 from app.account a where a.id=target and a.status='active'
    and persona_key=any(app.active_personas(a.id)::text[])
    and (case when persona_key='guardian' then
      exists(select 1 from app.guardian_profile g where g.account_id=a.id)
    else exists(select 1 from app.staff_profile p where p.account_id=a.id and app.profile_active_at(p,app.school_today())
      and ((persona_key='teacher')=(p.role='teacher'))) end))
$$;

create function app.contact_name(target uuid,persona_key text)
returns text language sql stable security definer set search_path=pg_catalog
as $$
  select case when persona_key='guardian' then
    (select g.display_name from app.guardian_profile g where g.account_id=target)
    else (select p.display_name from app.staff_profile p where p.account_id=target) end
$$;

create function app.contact_admin_grant(target uuid,needed text)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
  select exists(select 1 from app.access_administrator a where a.account_id=target and a.revoked_at is null)
    or exists(select 1 from app.capability_grant g where g.account_id=target and g.capability=needed
      and g.revoked_at is null and g.valid_from<=now() and (g.valid_until is null or now()<g.valid_until))
$$;

create function app.current_guardian_classes(target uuid)
returns table(class_id uuid)
language sql stable security definer set search_path=pg_catalog
as $$
  select distinct e.class_id from app.guardian_profile p
  join app.child_link l on l.guardian_id=p.id join app.student s on s.id=l.student_id
  join app.enrollment e on e.student_id=s.id
  cross join (select app.school_today() as school_day) t
  where p.account_id=target and l.state='approved' and l.effective_from<=now()
    and (l.effective_until is null or now()<l.effective_until) and s.state='active'
    and e.voided_at is null and e.effective_from<=t.school_day and t.school_day<e.effective_until
$$;

create function app.current_guardian_relationship(target uuid)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
  select exists(
    select 1 from app.guardian_profile p join app.child_link l on l.guardian_id=p.id
    join app.student s on s.id=l.student_id
    where p.account_id=target and l.state='approved' and l.effective_from<=now()
      and (l.effective_until is null or now()<l.effective_until) and s.state='active'
  )
$$;

create function app.directory_relationship_allowed(initiator uuid,initiator_persona text,partner uuid,partner_persona text)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
  select initiator<>partner and app.contact_account_active(initiator,initiator_persona)
    and app.contact_account_active(partner,partner_persona) and (case initiator_persona
      when 'guardian' then partner_persona='admin' or (partner_persona='teacher' and exists(
        select 1 from app.staff_profile p join app.teaching_assignment a on p.account_id=partner
        join app.current_guardian_classes(initiator) c on c.class_id=a.class_id
        where app.teacher_applies(a.id,p.id,app.school_today())
      ))
      when 'teacher' then partner_persona='admin' or (partner_persona='guardian' and exists(
        select 1 from app.staff_profile p join app.teaching_assignment a on p.account_id=initiator
        join app.current_guardian_classes(partner) c on c.class_id=a.class_id
        where app.teacher_applies(a.id,p.id,app.school_today(),'comms.class')
      ))
      when 'admin' then case partner_persona
        when 'guardian' then app.contact_admin_grant(initiator,'students.manage') and app.current_guardian_relationship(partner)
        when 'teacher' then app.contact_admin_grant(initiator,'school.manage') or app.contact_admin_grant(initiator,'academics.supervise')
        when 'admin' then app.contact_admin_grant(initiator,'school.manage') or app.contact_admin_grant(initiator,'academics.supervise')
          or app.contact_admin_grant(initiator,'students.manage') or app.contact_admin_grant(initiator,'finance.read')
        else false end
      else false end)
$$;

create function app.office_delegate_active(inbox_key text,target uuid)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
  select app.contact_account_active(target,'admin') and exists(select 1 from app.inbox_grant g where g.account_id=target
    and g.inbox=inbox_key and g.revoked_at is null and g.valid_from<=now() and (g.valid_until is null or now()<g.valid_until))
$$;

-- B02 replaces this hook with the issued-invoice, named-payer projection.
create function app.invoice_thread_context(payer uuid,invoice uuid)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$ select false $$;

create function app.thread_reference_allowed(kind_key text,target uuid)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
  select case kind_key
    when 'homework' then case when app.actor_persona()='guardian' then exists(
      select 1 from app.homework_roster g cross join lateral app.homework_projection(g.student_id,null,null,target) h
      where g.homework_id=target
    ) else exists(select 1 from app.homework_projection(null,null,null,target)) end
    when 'attendance' then exists(
      select 1 from app.attendance_row r join app.attendance_sheet s on s.id=r.sheet_id where r.id=target and
        (app.has_child_link(r.student_id) or app.attendance_scope(s.class_id,s.school_date,'attendance.read'))
    )
    when 'invoice' then app.actor_persona()='guardian' and app.invoice_thread_context(app.actor_account(),target)
    else false end
$$;

create function app.homework_conversation_contacts(target uuid)
returns table(contact_id text,display_name text)
language sql stable security definer set search_path=pg_catalog
as $$
  select distinct d.id,d.display_name
  from app.directory_contacts() d join app.staff_profile p on p.account_id=d.account_id
  join app.homework h on h.id=target join app.teaching_assignment t on t.offering_id=h.offering_id
  where d.target_persona='teacher' and app.actor_persona()='guardian'
    and app.thread_reference_allowed('homework',target)
    and app.teacher_applies(t.id,p.id,app.school_today())
$$;

create function app.thread_can_access(target uuid)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
  select exists(
    select 1 from app.thread t left join app.office_case c on c.thread_id=t.id where t.id=target and (
      (t.kind='direct' and exists(
        select 1 from app.thread_participant p where p.thread_id=t.id and p.account_id=app.actor_account() and p.persona=app.actor_persona()::text
      ) and app.directory_relationship_allowed(t.opened_by,t.opened_persona,
        case when t.opened_by=t.pair_first then t.pair_second else t.pair_first end,
        case when t.opened_by=t.pair_first then t.persona_second else t.persona_first end))
      or (t.kind='office' and (
        (c.requester_id=app.actor_account() and c.requester_persona=app.actor_persona()::text and
          (c.origin_kind is null or app.thread_reference_allowed(c.origin_kind,c.origin_id)))
        or (app.has_inbox(c.inbox) and app.office_delegate_active(c.inbox,app.actor_account()))
      ))
    )
  )
$$;

create function app.thread_can_reply(target uuid)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
  select app.thread_can_access(target) and not exists(
    select 1 from app.office_case c where c.thread_id=target and c.status='closed'
  )
$$;

create function app.thread_key_available(target_kind text,contact_key text,context_kind text,context_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
  select case target_kind
    when 'person' then not exists(
      select 1 from app.directory_contacts() d join app.thread t on t.kind='direct' and (
        (t.pair_first=app.actor_account() and t.persona_first=app.actor_persona()::text and
          t.pair_second=d.account_id and t.persona_second=d.target_persona::text) or
        (t.pair_second=app.actor_account() and t.persona_second=app.actor_persona()::text and
          t.pair_first=d.account_id and t.persona_first=d.target_persona::text)
      )
      where d.id=contact_key and not app.thread_can_access(t.id)
    )
    when 'office' then not exists(
      select 1 from app.office_case c where c.requester_id=app.actor_account() and c.requester_persona=app.actor_persona()::text
        and c.inbox=contact_key and c.origin_kind is not distinct from context_kind and c.origin_id is not distinct from context_id
        and not app.thread_can_access(c.thread_id)
    )
    else false end
$$;

create function app.open_thread(target_kind text,contact_key text,context_kind text,context_id uuid)
returns table(thread_id uuid,kind text,can_reply boolean,case_id uuid)
language plpgsql security definer set search_path=pg_catalog
as $$
declare actor uuid:=app.actor_account();
declare persona_key text:=app.actor_persona()::text;
declare contact_id uuid;
declare contact_persona text;
declare thread_ref uuid;
declare case_ref uuid;
declare first_id uuid;
declare second_id uuid;
declare first_role text;
declare second_role text;
begin
  if actor is null or persona_key is null then raise exception 'Conversation requires a school account' using errcode='42501'; end if;
  perform app.lock_school_calendar();
  if (context_kind is null)<>(context_id is null)
    or (context_kind is not null and not app.thread_reference_allowed(context_kind,context_id)) then
    raise exception 'School reference is unavailable' using errcode='42501';
  end if;

  if target_kind='person' then
    select d.account_id,d.target_persona::text into contact_id,contact_persona
      from app.directory_contacts() d where d.id=contact_key and d.account_id is not null;
    if not found or not app.directory_relationship_allowed(actor,persona_key,contact_id,contact_persona) then
      raise exception 'Contact is unavailable' using errcode='42501';
    end if;
    if context_kind is not null and (context_kind<>'homework' or not exists(
      select 1 from app.homework_conversation_contacts(context_id) h where h.contact_id=contact_key
    )) then raise exception 'Reference is outside the contact scope' using errcode='42501'; end if;
    first_id:=least(actor,contact_id);
    second_id:=greatest(actor,contact_id);
    first_role:=case when actor=first_id then persona_key else contact_persona end;
    second_role:=case when actor=first_id then contact_persona else persona_key end;
    perform pg_advisory_xact_lock(hashtextextended(jsonb_build_array('direct',first_id,first_role,second_id,second_role)::text,0));
    select t.id into thread_ref from app.thread t where t.kind='direct' and t.pair_first=first_id and t.pair_second=second_id
      and t.persona_first=first_role and t.persona_second=second_role;
    if not found then
      insert into app.thread as t(kind,opened_by,opened_persona,pair_first,pair_second,persona_first,persona_second)
        values('direct',actor,persona_key,first_id,second_id,first_role,second_role) returning t.id into thread_ref;
      insert into app.thread_participant(thread_id,account_id,persona)
        values(thread_ref,first_id,first_role),(thread_ref,second_id,second_role);
    end if;
    if not app.thread_can_access(thread_ref) then raise exception 'Conversation is unavailable' using errcode='42501'; end if;
    if context_kind is not null then
      insert into app.thread_reference values(thread_ref,context_kind,context_id,actor,now()) on conflict do nothing;
    end if;
    return query select thread_ref,'direct'::text,true,null::uuid;
    return;
  end if;
  if target_kind<>'office' or not exists(
    select 1 from app.directory_contacts() d where d.id=contact_key and d.account_id is null
  ) then raise exception 'Office is unavailable' using errcode='42501'; end if;
  if context_kind is not null and not ((context_kind='attendance' and contact_key='student_affairs')
    or (context_kind='invoice' and contact_key='accounts')) then
    raise exception 'School reference belongs to another office' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(jsonb_build_array('office',actor,persona_key,contact_key,context_kind,context_id)::text,0));
  select c.id,c.thread_id into case_ref,thread_ref from app.office_case c
    where c.requester_id=actor and c.requester_persona=persona_key and c.inbox=contact_key
      and c.origin_kind is not distinct from context_kind and c.origin_id is not distinct from context_id;
  if not found then
    insert into app.thread as t(kind,opened_by,opened_persona) values('office',actor,persona_key) returning t.id into thread_ref;
    insert into app.thread_participant(thread_id,account_id,persona) values(thread_ref,actor,persona_key);
    insert into app.office_case as c(thread_id,requester_id,requester_persona,inbox,origin_kind,origin_id)
      values(thread_ref,actor,persona_key,contact_key,context_kind,context_id) returning c.id into case_ref;
    if context_kind is not null then insert into app.thread_reference values(thread_ref,context_kind,context_id,actor,now()); end if;
  end if;
  return query select thread_ref,'office'::text,app.thread_can_reply(thread_ref),case_ref;
end
$$;

create function app.thread_projection(target uuid,inbox_key text)
returns table(id uuid,kind text,contact_name text,inbox text,case_id uuid,case_status text,
  case_revision integer,created_at timestamptz,can_reply boolean,can_manage_case boolean)
language sql stable security definer set search_path=pg_catalog
as $$
  select t.id,t.kind,
    case when t.kind='direct' then
      case when t.pair_first=app.actor_account() then app.contact_name(t.pair_second,t.persona_second)
           else app.contact_name(t.pair_first,t.persona_first) end
    when app.has_inbox(c.inbox) and c.requester_id<>app.actor_account()
      then app.contact_name(c.requester_id,c.requester_persona)
    end,
    c.inbox,c.id,c.status,c.revision,t.created_at,app.thread_can_reply(t.id),
    c.id is not null and app.has_inbox(c.inbox) and app.office_delegate_active(c.inbox,app.actor_account())
  from app.thread t left join app.office_case c on c.thread_id=t.id
  where (target is null or t.id=target) and (inbox_key is null or c.inbox=inbox_key)
    and app.thread_can_access(t.id)
$$;

create function app.thread_references(target uuid)
returns table(reference_kind text,reference_id uuid,child_id uuid)
language sql stable security definer set search_path=pg_catalog
as $$
  select r.reference_kind,r.reference_id,
    case when app.actor_persona()='guardian' then case r.reference_kind
      when 'homework' then (
        select p.student_id from app.homework_roster p
        cross join lateral app.homework_projection(p.student_id,null,null,r.reference_id) h
        where p.homework_id=r.reference_id order by p.student_id limit 1
      )
      when 'attendance' then (
        select a.student_id from app.attendance_row a where a.id=r.reference_id and app.has_child_link(a.student_id)
      )
    end end
  from app.thread_reference r where r.thread_id=target
    and app.thread_can_access(target) and app.thread_reference_allowed(r.reference_kind,r.reference_id)
  order by r.added_at,r.reference_id
$$;

create function app.office_case_visible(target uuid)
returns table(id uuid,thread_id uuid,inbox text,status text,assignee_id uuid,assignee_name text,revision integer,can_manage boolean,
  origin_kind text,origin_id uuid)
language sql stable security definer set search_path=pg_catalog
as $$
  select c.id,c.thread_id,c.inbox,c.status,
    case when a.manages and live.assigned then c.assignee_id end,
    case when a.manages and live.assigned then app.contact_name(c.assignee_id,'admin') end,
    c.revision,a.manages,
    case when secure.can_read then c.origin_kind end,case when secure.can_read then c.origin_id end
  from app.office_case c
  cross join lateral (select app.has_inbox(c.inbox) and app.office_delegate_active(c.inbox,app.actor_account()) as manages) a
  cross join lateral (select app.office_delegate_active(c.inbox,c.assignee_id) as assigned) live
  cross join lateral (select app.thread_reference_allowed(c.origin_kind,c.origin_id) as can_read) secure
  where c.id=target and app.thread_can_access(c.thread_id)
$$;

create function app.office_case_delegates(target uuid)
returns table(account_id uuid,display_name text)
language sql stable security definer set search_path=pg_catalog
as $$
  select distinct g.account_id,p.display_name from app.office_case c join app.inbox_grant g on g.inbox=c.inbox
    join app.staff_profile p on p.account_id=g.account_id
  where c.id=target and app.has_inbox(c.inbox) and app.office_delegate_active(c.inbox,app.actor_account())
    and app.office_delegate_active(c.inbox,g.account_id)
$$;

create function app.change_office_case(target uuid,expected integer,new_status text,new_assignee uuid,change_assignee boolean)
returns integer language plpgsql security definer set search_path=pg_catalog
as $$
declare previous app.office_case%rowtype;
declare changed_revision integer;
begin
  select c.* into previous from app.office_case c where c.id=target for update;
  if not found or not (app.has_inbox(previous.inbox) and app.office_delegate_active(previous.inbox,app.actor_account()))
    then raise exception 'Office case is unavailable' using errcode='42501'; end if;
  if previous.revision<>expected then return null; end if;
  if change_assignee and new_assignee is not null and not app.office_delegate_active(previous.inbox,new_assignee) then
    raise exception 'Assignee is outside the office delegation' using errcode='23514';
  end if;
  update app.office_case c set status=coalesce(new_status,c.status),revision=c.revision+1,updated_at=now(),
    assignee_id=case when change_assignee then new_assignee else c.assignee_id end
    where c.id=target returning c.revision into changed_revision;
  return changed_revision;
end
$$;

revoke all on function app.contact_account_active(uuid,text),app.contact_name(uuid,text),app.contact_admin_grant(uuid,text),
  app.current_guardian_classes(uuid),app.current_guardian_relationship(uuid),app.directory_relationship_allowed(uuid,text,uuid,text),
  app.office_delegate_active(text,uuid),app.invoice_thread_context(uuid,uuid),app.thread_reference_allowed(text,uuid),
  app.homework_conversation_contacts(uuid),app.thread_can_access(uuid),app.thread_can_reply(uuid),app.thread_key_available(text,text,text,uuid),app.open_thread(text,text,text,uuid),
  app.thread_projection(uuid,text),app.thread_references(uuid),app.office_case_visible(uuid),app.office_case_delegates(uuid),
  app.change_office_case(uuid,integer,text,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function app.thread_reference_allowed(text,uuid),app.homework_conversation_contacts(uuid),app.thread_can_access(uuid),
  app.thread_can_reply(uuid),app.thread_key_available(text,text,text,uuid),app.open_thread(text,text,text,uuid),app.thread_projection(uuid,text),app.thread_references(uuid),
  app.office_case_visible(uuid),app.office_case_delegates(uuid),app.change_office_case(uuid,integer,text,uuid,boolean) to app_runtime;
