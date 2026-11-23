-- Admins supervise class activity without exercising Lehrkraft write privileges.
-- All existing records and parent visibility remain unchanged.
set local search_path=pg_catalog,public,extensions;

create or replace function app.academic_offering_scope(target uuid,local_day date,capability text default null)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
  select exists (
    select 1 from app.class_subject o join app.school_class c on c.id=o.class_id
    join app.school_year y on y.id=c.year_id
    where o.id=target and local_day>=y.starts_on and local_day<y.ends_exclusive and (
      (capability is null and (
        app.has_capability('academics.supervise')
        or app.teacher_scope(c.id,local_day,'academics.plan',o.id)
        or app.teacher_scope(c.id,local_day,'academics.publish',o.id)
        or app.teacher_scope(c.id,local_day,'academics.log',o.id)
        or app.teacher_scope(c.id,local_day,'academics.grade',o.id)
      ))
      or (capability in ('academics.plan','academics.publish','academics.log','academics.grade')
        and app.teacher_scope(c.id,local_day,capability,o.id))
    )
  )
$$;

create or replace function app.attendance_scope(target uuid,local_day date,operation text)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
  select exists(
    select 1 from app.school_class c join app.school_year y on y.id=c.year_id
    where c.id=target and local_day>=y.starts_on and local_day<y.ends_exclusive
      and y.state in ('active','closed')
      and (
        (operation='attendance.read' and (
          app.has_capability('attendance.supervise')
          or app.teacher_scope(c.id,local_day,'attendance.read')
          or app.teacher_scope(c.id,local_day,'attendance.mark')
          or app.teacher_scope(c.id,local_day,'attendance.approve')
        ))
        or (operation in ('attendance.mark','attendance.approve')
          and app.teacher_scope(c.id,local_day,operation))
      )
  )
$$;

-- A missing operation always means read; specifying an operation always
-- means assignment-scoped Lehrkraft write permission.
create or replace function app.homework_staff_scope(target uuid,issue_day date,operation text default null)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
  select case when operation is null then (
    app.academic_offering_scope(target,issue_day)
  ) else operation in ('academics.plan','academics.grade') and app.academic_offering_scope(target,issue_day,operation) end
$$;

create or replace function app.evaluation_staff_scope(offering uuid,scope_day date,needed text default null)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
  select case when needed is null then (
    app.academic_offering_scope(offering,scope_day)
  ) else needed in ('academics.grade','academics.publish') and app.academic_offering_scope(offering,scope_day,needed) end
$$;

create or replace function app.exam_scope(offering uuid,exam_day date,needed text default null)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
  select case when needed is null then (
    app.academic_offering_scope(offering,exam_day)
  ) else needed in ('academics.plan','academics.grade','academics.publish') and app.academic_offering_scope(offering,exam_day,needed) end
$$;

create or replace function app.teaching_log_rows(target_offering uuid,target uuid)
returns table(id uuid,offering_id uuid,assignment_id uuid,lesson_id uuid,lesson_version_id uuid,actual_date date,
  delivered_notes text,recorded_at timestamptz,recorded_by_name text,revision integer,can_edit boolean,
  planned_date date,plan_title_ar text,plan_title_de text)
language sql stable security definer set search_path=pg_catalog
as $$
  select l.id,l.offering_id,l.assignment_id,l.lesson_id,l.lesson_version_id,l.actual_date,l.delivered_notes,l.recorded_at,
    p.display_name,l.revision,app.academic_writable_day(l.offering_id,l.actual_date,'academics.log'),
    case when v.id is not null then v.planned_date else plan.planned_date end,coalesce(v.title_ar,plan.title_ar),coalesce(v.title_de,plan.title_de)
  from app.teaching_log l left join app.staff_profile p on p.account_id=l.recorded_by
  left join app.curriculum_lesson plan on plan.id=l.lesson_id
  left join app.curriculum_publication v on v.id=l.lesson_version_id
  where (target_offering is null or l.offering_id=target_offering) and (target is null or l.id=target)
    and app.academic_offering_scope(l.offering_id,l.actual_date)
$$;

create or replace function app.assessed_activity_rows(child uuid,target_offering uuid,target uuid)
returns table(id uuid,offering_id uuid,activity_date date,title text,max_score numeric,score numeric,mark_id uuid,
  mark_revision integer,class_id uuid,class_code text,subject_name_ar text,subject_name_de text,can_edit boolean)
language sql stable security definer set search_path=pg_catalog
as $$
  select a.id,a.offering_id,a.activity_date,a.title,a.max_score,m.score,m.id,m.revision,c.id,c.code,s.name_ar,s.name_de,
    child is null and app.academic_writable_day(a.offering_id,a.activity_date,'academics.grade')
  from app.assessed_activity a join app.class_subject o on o.id=a.offering_id
  join app.school_class c on c.id=o.class_id join app.subject s on s.id=o.subject_id
  left join app.activity_mark m on m.activity_id=a.id and m.student_id=child
  where (target_offering is null or a.offering_id=target_offering) and (target is null or a.id=target)
    and ((child is null and app.academic_offering_scope(a.offering_id,a.activity_date))
      or (child is not null and m.id is not null and app.academic_child_offering(child,a.offering_id,a.activity_date)))
$$;

create or replace function app.assessed_activity_roster(target uuid)
returns table(student_id uuid,student_name text,student_number text,enrollment_id uuid,score numeric,
  mark_id uuid,revision integer,visible boolean)
language sql stable security definer set search_path=pg_catalog
as $$
  select s.id,s.display_name,s.student_number,e.id,m.score,m.id,coalesce(m.revision,1),m.id is not null
  from app.assessed_activity a join app.class_subject o on o.id=a.offering_id
  join app.enrollment e on e.class_id=o.class_id and e.voided_at is null
    and e.effective_from<=a.activity_date and a.activity_date<e.effective_until
  join app.student s on s.id=e.student_id
  left join app.activity_mark m on m.activity_id=a.id and m.student_id=s.id
  where a.id=target and app.academic_offering_scope(a.offering_id,a.activity_date)
$$;

create or replace function app.activity_correction_rows(target uuid,student uuid)
returns table(revision integer,previous_score numeric,score numeric,actor_name text,occurred_at timestamptz,reason text)
language sql stable security definer set search_path=pg_catalog
as $$
  select h.revision,h.previous_score,h.score,p.display_name,h.occurred_at,h.private_reason
  from app.activity_mark m join app.activity_mark_correction h on h.mark_id=m.id
  join app.assessed_activity a on a.id=m.activity_id left join app.staff_profile p on p.account_id=h.actor_id
  where m.activity_id=target and m.student_id=student
    and app.academic_offering_scope(a.offering_id,a.activity_date)
$$;

create or replace function app.academic_teaching_sources(student uuid,date_from date,date_to date,subject uuid)
returns table(source_id uuid,offering_id uuid,subject_id uuid,class_id uuid,year_id uuid,enrollment_id uuid,
  school_date date,title_ar text,title_de text,revision integer)
language sql stable security definer set search_path=pg_catalog
as $$
  select t.id,o.id,o.subject_id,c.id,c.year_id,e.id,t.actual_date,
    case when app.actor_persona()='guardian' then published.title_ar else coalesce(published.title_ar,plan.title_ar) end,
    case when app.actor_persona()='guardian' then published.title_de else coalesce(published.title_de,plan.title_de) end,t.revision
  from app.teaching_log t join app.class_subject o on o.id=t.offering_id
  join app.school_class c on c.id=o.class_id join app.enrollment e on e.class_id=c.id and e.student_id=student
    and e.voided_at is null and e.effective_from<=t.actual_date and t.actual_date<e.effective_until
  left join app.curriculum_lesson plan on plan.id=t.lesson_id
  left join app.curriculum_publication published on published.id=coalesce(t.lesson_version_id,plan.published_id)
  where t.actual_date between date_from and date_to and (subject is null or o.subject_id=subject)
    and (app.academic_offering_scope(o.id,t.actual_date) or app.academic_child_offering(student,o.id,t.actual_date))
$$;

create or replace function app.academic_activity_sources(student uuid,date_from date,date_to date,subject uuid)
returns table(source_kind text,source_id uuid,activity_id uuid,offering_id uuid,subject_id uuid,class_id uuid,year_id uuid,
  enrollment_id uuid,school_date date,title text,score numeric,max_score numeric,revision integer)
language sql stable security definer set search_path=pg_catalog
as $$
  select 'activity'::text,m.id,a.id,o.id,o.subject_id,c.id,c.year_id,m.enrollment_id,a.activity_date,a.title,m.score,a.max_score,m.revision
  from app.activity_mark m join app.assessed_activity a on a.id=m.activity_id
  join app.class_subject o on o.id=a.offering_id join app.school_class c on c.id=o.class_id
  where m.student_id=student and a.activity_date between date_from and date_to and (subject is null or o.subject_id=subject)
    and (app.academic_offering_scope(o.id,a.activity_date) or app.academic_child_offering(student,o.id,a.activity_date))
$$;

-- PII-free school-day supervision. SECURITY DEFINER bypasses content RLS
-- only to provide class-level counts to authorized Admins.
create function app.admin_class_oversight(scope_day date)
returns table (
  class_id uuid,year_id uuid,class_code text,class_name_ar text,class_name_de text,
  teacher_name text,attendance_state text,unmarked_count integer,
  teaching_entries integer,active_homework integer,upcoming_exams integer,marked_exam_results integer
)
language sql stable security definer set search_path=pg_catalog
as $$
  with permitted as (
    select app.has_capability('attendance.supervise') as attendance,
           app.has_capability('academics.supervise') as academics
  )
  select c.id,c.year_id,c.code,c.name_ar,c.name_de,
    (select p.display_name from app.teaching_assignment t
      join app.staff_profile p on p.id=t.staff_id
      where t.class_id=c.id and t.kind='primary' and t.revoked_at is null
        and t.effective_from<=scope_day and scope_day<t.effective_until
      order by t.effective_from desc limit 1),
    case when permissions.attendance then
      coalesce((select s.state from app.attendance_sheet s
        where s.class_id=c.id and s.school_date=scope_day),'not_started')
      else null end,
    case when permissions.attendance then
      (select count(*)::integer from app.attendance_sheet sheet
        join app.attendance_row r on r.sheet_id=sheet.id
        where sheet.class_id=c.id and sheet.school_date=scope_day and r.status is null)
      else null end,
    case when permissions.academics then
      (select count(*)::integer from app.teaching_log log
        join app.class_subject offering on offering.id=log.offering_id
        where offering.class_id=c.id and log.actual_date=scope_day)
      else null end,
    case when permissions.academics then
      (select count(*)::integer from app.homework h
        join app.class_subject offering on offering.id=h.offering_id
        where offering.class_id=c.id and h.issued_on<=scope_day and h.due_on>=scope_day)
      else null end,
    case when permissions.academics then
      (select count(*)::integer from app.exam e
        join app.class_subject offering on offering.id=e.offering_id
        where offering.class_id=c.id and e.exam_date>=scope_day and e.exam_date < scope_day+14)
      else null end,
    case when permissions.academics then
      (select count(*)::integer from app.exam_result r
        join app.exam e on e.id=r.exam_id
        join app.class_subject offering on offering.id=e.offering_id
        where offering.class_id=c.id and e.exam_date>=scope_day-30 and e.exam_date<=scope_day
          and r.score is not null)
      else null end
  from app.school_class c
  join app.school_year y on y.id=c.year_id
  cross join permitted permissions
  where app.actor_persona()='admin'
    and (permissions.attendance or permissions.academics)
    and scope_day>=y.starts_on and scope_day<y.ends_exclusive
  order by c.code,c.id
$$;

revoke all on function app.admin_class_oversight(date) from public,anon,authenticated,service_role;
grant execute on function app.admin_class_oversight(date) to app_runtime;
