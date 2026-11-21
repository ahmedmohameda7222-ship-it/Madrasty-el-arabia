create table app.audit_action_rule (
  action text primary key,
  resource_kind text not null,
  change_category text not null,
  allowed_capabilities text[] not null check (cardinality(allowed_capabilities) > 0),
  link_kind text
);
alter table app.audit_action_rule enable row level security;

insert into app.audit_action_rule(action,resource_kind,change_category,allowed_capabilities,link_kind) values
  ('access.grants_updated','access','permissions',array['access.manage'],'access'),
  ('staff.deactivated','access','revocation',array['access.manage'],'access'),
  ('school.settings_updated','calendar','settings',array['school.manage'],'calendar'),
  ('school.year_created','calendar','creation',array['school.manage'],'calendar'),
  ('school.year_changed','calendar','update',array['school.manage'],'calendar'),
  ('school.day_changed','calendar','update',array['school.manage'],'calendar'),
  ('school.class_created','assignments','creation',array['school.manage','academics.supervise'],'class'),
  ('school.class_changed','assignments','update',array['school.manage','academics.supervise'],'class'),
  ('school.student_created','family','creation',array['students.manage'],'student'),
  ('school.student_updated','family','update',array['students.manage'],'student'),
  ('school.guardian_created','family','creation',array['students.manage'],'guardian'),
  ('school.guardian_updated','family','update',array['students.manage'],'guardian'),
  ('family.link_pending','family','creation',array['students.manage'],'relationship'),
  ('family.link_approved','family','approval',array['students.manage'],'relationship'),
  ('family.link_revoked','family','revocation',array['students.manage'],'relationship'),
  ('school.enrollment_placed','family','creation',array['students.manage'],'enrollment'),
  ('school.enrollment_transferred','family','transfer',array['students.manage'],'enrollment'),
  ('school.enrollment_withdrawn','family','withdrawal',array['students.manage'],'enrollment'),
  ('school.year_rolled_over','family','approval',array['students.manage'],null),
  ('school.import_uploaded','imports','creation',array['students.manage'],'import'),
  ('school.import_committed','imports','approval',array['students.manage'],null),
  ('invitation.issued','invitation','creation',array['students.manage','applications.manage'],'invitations'),
  ('invitation.batch_requested','invitation','creation',array['students.manage'],'invitations'),
  ('teacher_application.decided','application','approval',array['applications.manage'],'applications'),
  ('school.staff_created','assignments','creation',array['school.manage','academics.supervise'],'assignments'),
  ('school.staff_updated','assignments','update',array['school.manage','academics.supervise'],'assignments'),
  ('school.assignment_created','assignments','creation',array['school.manage','academics.supervise'],'assignment'),
  ('school.assignment_changed','assignments','update',array['school.manage','academics.supervise'],'assignment'),
  ('school.substitute_assigned','assignments','creation',array['school.manage','academics.supervise'],'substitute'),
  ('school.room_created','timetable','creation',array['school.manage','academics.supervise'],'timetable'),
  ('school.room_changed','timetable','update',array['school.manage','academics.supervise'],'timetable'),
  ('school.timetable_added','timetable','creation',array['school.manage','academics.supervise'],'timetable'),
  ('school.timetable_changed','timetable','update',array['school.manage','academics.supervise'],'timetable'),
  ('school.timetable_canceled','timetable','revocation',array['school.manage','academics.supervise'],'timetable'),
  ('attendance.sheet_opened','attendance','creation',array['attendance.supervise'],null),
  ('attendance.sheet_approved','attendance','approval',array['attendance.supervise'],null),
  ('attendance.arrival_confirmed','attendance','update',array['attendance.supervise'],null),
  ('attendance.corrected','attendance','correction',array['attendance.supervise'],null),
  ('finance.bank_changed','bank','settings',array['bank.configure'],null),
  ('invoice.issued','finance','creation',array['finance.read'],null),
  ('payment.recorded','finance','creation',array['finance.read'],null),
  ('payment.reversed','finance','reversal',array['finance.read'],null);

create table app.staff_deactivation_record (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references app.account,
  target_account_id uuid not null references app.account,
  request_id uuid not null unique,
  requested_scope text not null check (requested_scope in ('staff','account')),
  reason text not null check (char_length(trim(reason)) between 1 and 400),
  occurred_at timestamptz not null default now()
);
alter table app.staff_deactivation_record enable row level security;
grant insert on app.staff_deactivation_record to app_runtime;
create policy staff_deactivation_record_write on app.staff_deactivation_record for insert to app_runtime
  with check (app.has_capability('access.manage') and actor_id=app.actor_account() and request_id=app.actor_request());

create function app.audit_scope(action_key text, event_actor uuid, event_metadata jsonb)
returns boolean
language sql stable security definer set search_path = pg_catalog
as $$
  select app.has_capability('audit.read') and exists (
    select 1 from app.audit_action_rule r,unnest(r.allowed_capabilities) grants(capability)
    where r.action=action_key and app.has_capability(grants.capability)
      and (r.resource_kind <> 'imports' or event_actor=app.actor_account())
      and (r.action <> 'invitation.issued'
        or (event_metadata->>'kind'='guardian' and grants.capability='students.manage')
        or (event_metadata->>'kind'='teacher' and grants.capability='applications.manage'))
  )
$$;

create policy audit_read_scoped on app.audit_entry for select
  using (app.audit_scope(action,actor_id,metadata));

create index audit_entry_actor_time on app.audit_entry(actor_id,occurred_at desc,id desc);
create index audit_entry_action_time on app.audit_entry(action,occurred_at desc,id desc);

create function app.audit_resource_link(link_kind text, aggregate uuid)
returns jsonb
language sql stable security definer set search_path = pg_catalog
as $$
  select case link_kind
    when 'access' then jsonb_build_object('kind','access')
    when 'calendar' then jsonb_build_object('kind','calendar')
    when 'assignments' then jsonb_build_object('kind','assignments')
    when 'student' then (select jsonb_build_object('kind','student','id',s.id) from app.student s where s.id=aggregate)
    when 'guardian' then (select jsonb_build_object('kind','guardian','id',g.id) from app.guardian_profile g where g.id=aggregate)
    when 'relationship' then (select jsonb_build_object('kind','guardian','id',l.guardian_id,'linkId',l.id)
      from app.child_link l where l.id=aggregate)
    when 'enrollment' then (select jsonb_build_object('kind','student','id',e.student_id)
      from app.enrollment e where e.id=aggregate)
    when 'import' then (select jsonb_build_object('kind','import','id',j.id)
      from app.family_import_job j where j.id=aggregate and j.state<>'committed' and j.expires_at>now()
        and j.owner_id=app.actor_account())
    when 'class' then (select jsonb_build_object('kind','class','id',c.id,'yearId',c.year_id) from app.school_class c where c.id=aggregate)
    when 'assignment' then (select jsonb_build_object('kind','class','id',c.id,'yearId',c.year_id)
      from app.teaching_assignment t join app.school_class c on c.id=t.class_id where t.id=aggregate)
    when 'substitute' then (select jsonb_build_object('kind','class','id',c.id,'yearId',c.year_id)
      from app.substitute_assignment d join app.teaching_assignment t on t.id=d.assignment_id
      join app.school_class c on c.id=t.class_id where d.id=aggregate)
    when 'timetable' then jsonb_build_object('kind','timetable')
    when 'invitations' then jsonb_build_object('kind','invitations')
    when 'applications' then jsonb_build_object('kind','applications')
  end
$$;

create function app.school_audit_projection(date_from date,date_to date,action_filter text,actor_filter uuid,entry_filter uuid)
returns table(id uuid,occurred_at timestamptz,actor_id uuid,actor_persona app.persona,actor_display text,
  action text,resource_kind text,change_category text,request_id uuid,resource_link jsonb)
language sql stable security definer set search_path = pg_catalog
as $$
  with school as (select coalesce((select timezone from app.school_settings where singleton),'UTC') as zone)
  select e.id,e.occurred_at,e.actor_id,e.persona,
    case when e.persona='guardian' then g.display_name else p.display_name end,
    e.action,r.resource_kind,r.change_category,e.request_id,app.audit_resource_link(r.link_kind,e.aggregate_id)
  from app.audit_entry e
  join app.audit_action_rule r on r.action=e.action
  cross join school
  left join app.staff_profile p on p.account_id=e.actor_id and e.persona<>'guardian'
  left join app.guardian_profile g on g.account_id=e.actor_id and e.persona='guardian'
  where app.audit_scope(e.action,e.actor_id,e.metadata)
    and (date_from is null or e.occurred_at >= (date_from::timestamp at time zone school.zone))
    and (date_to is null or e.occurred_at < ((date_to+1)::timestamp at time zone school.zone))
    and (action_filter is null or e.action=action_filter)
    and (actor_filter is null or e.actor_id=actor_filter)
    and (entry_filter is null or e.id=entry_filter)
$$;

revoke all on function app.audit_scope(text,uuid,jsonb),app.audit_resource_link(text,uuid),
  app.school_audit_projection(date,date,text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function app.school_audit_projection(date,date,text,uuid,uuid) to app_runtime;
