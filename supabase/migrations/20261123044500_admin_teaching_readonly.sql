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

-- Approved attendance may be corrected only by an assigned Lehrkraft.
-- Previously approved records and historical cancellation events remain intact.

create or replace function app.correct_attendance_record(target uuid,expected_revision integer,next_status app.attendance_status,explanation text)
returns table (result text,student_id uuid,class_id uuid,school_date date,previous_status app.attendance_status,
  status app.attendance_status,revision integer,previous_event_id uuid,calendar_cancelled boolean)
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  row_before app.attendance_row%rowtype;
  sheet app.attendance_sheet%rowtype;
  old_reference uuid;
  updated_revision integer;
  is_cancelled boolean;
begin
  if app.actor_persona() <> 'teacher' then raise exception 'Only a teacher may correct attendance' using errcode='42501'; end if;
  perform app.lock_school_calendar();
  select a.* into sheet from app.attendance_sheet a join app.attendance_row r on r.sheet_id=a.id where r.id=target;
  if not found or not app.attendance_scope(sheet.class_id,sheet.school_date,'attendance.approve') then
    raise exception 'Correction scope denied' using errcode='42501';
  end if;
  perform app.lock_classes(sheet.class_id);
  select a.* into sheet from app.attendance_sheet a where a.id=sheet.id for update;
  select r.* into row_before from app.attendance_row r where r.id=target and r.sheet_id=sheet.id for update;
  if not found or sheet.state<>'approved' or not exists(select 1 from app.school_year y where y.id=sheet.year_id and y.state='active') then
    raise exception 'Attendance is not open for correction' using errcode='23P01';
  end if;
  is_cancelled:=sheet.calendar_cancelled_at is not null or not app.is_teaching_day(sheet.class_id,sheet.school_date);
  if row_before.revision<>expected_revision then
    return query select 'stale'::text,row_before.student_id,sheet.class_id,sheet.school_date,
      row_before.status,row_before.status,row_before.revision,null::uuid,is_cancelled;
    return;
  end if;
  if next_status is null or next_status=row_before.status or coalesce(char_length(btrim(explanation)),0) not between 1 and 500 then
    raise exception 'A correction requires a different status and reason' using errcode='23514';
  end if;
  if is_cancelled and next_status='absent_unexcused' then
    raise exception 'Cancelled attendance cannot have an unexcused absence' using errcode='23514';
  end if;
  select e.event_id into old_reference from app.attendance_approved_event e where e.row_id=target and e.row_revision=row_before.revision;
  if next_status<>'absent_excused' then
    update app.family_excuse e set state='superseded',ended_at=now(),revision=e.revision+1
      where e.row_id=target and e.state='pending';
  end if;
  update app.attendance_row r set status=next_status,revision=r.revision+1,
    lock_source=case when next_status='absent_excused' then r.lock_source end,
    confirmed_arrival_at=case when next_status in ('late','present') then r.confirmed_arrival_at end,
    confirmed_arrival_by=case when next_status in ('late','present') then r.confirmed_arrival_by end
  where r.id=target returning r.revision into updated_revision;
  insert into app.attendance_approved_revision(row_id,row_revision,previous_revision,change_kind,prior_status,resulting_status,actor_id,private_reason)
    values(target,updated_revision,row_before.revision,'correction',row_before.status,next_status,app.actor_account(),btrim(explanation));
  return query select 'corrected'::text,row_before.student_id,sheet.class_id,sheet.school_date,row_before.status,
    next_status,updated_revision,old_reference,is_cancelled;
end
$$;

create or replace function app.attendance_correction_context(target uuid)
returns table(sheet_id uuid,calendar_cancelled boolean,approval_revision integer,can_correct boolean,can_cancel boolean)
language sql stable security definer set search_path = pg_catalog
as $$
  select s.id,s.calendar_cancelled_at is not null or not app.is_teaching_day(s.class_id,s.school_date),s.approval_revision,
    y.state='active' and app.attendance_scope(s.class_id,s.school_date,'attendance.approve'),
    false
  from app.attendance_row r join app.attendance_sheet s on s.id=r.sheet_id join app.school_year y on y.id=s.year_id
  where r.id=target and s.state='approved' and app.attendance_scope(s.class_id,s.school_date,'attendance.read')
$$;

create or replace function app.cancel_approved_attendance_day(target uuid,expected_revision integer,explanation text)
returns table(result text,row_id uuid,student_id uuid,class_id uuid,school_date date,status app.attendance_status,
  revision integer,previous_event_id uuid)
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  sheet app.attendance_sheet%rowtype;
  prior app.attendance_row%rowtype;
  old_event uuid;
  changed integer;
begin
  -- Remains for historical function signature compatibility only.
  -- Admin must never modify a pupil's approved teaching record.
  raise exception 'Approved attendance may only be corrected by a teacher' using errcode='42501';
  if not(app.has_capability('attendance.supervise') and app.has_capability('school.manage')) then
    raise exception 'Calendar correction scope denied' using errcode='42501';
  end if;
  perform app.lock_school_calendar();
  select s.* into sheet from app.attendance_sheet s where s.id=target;
  if not found then raise exception 'Attendance sheet unavailable' using errcode='42501'; end if;
  perform app.lock_classes(sheet.class_id);
  select s.* into sheet from app.attendance_sheet s where s.id=target for update;
  if sheet.state<>'approved' or sheet.calendar_cancelled_at is not null
    or not exists(select 1 from app.school_year y where y.id=sheet.year_id and y.state='active') then
    raise exception 'Attendance is not open for calendar correction' using errcode='23P01';
  end if;
  if sheet.approval_revision<>expected_revision then
    return query select 'stale'::text,null::uuid,null::uuid,sheet.class_id,sheet.school_date,null::app.attendance_status,null::integer,null::uuid;
    return;
  end if;
  if coalesce(char_length(btrim(explanation)),0) not between 1 and 500 then raise exception 'Correction reason required' using errcode='23514'; end if;
  update app.attendance_sheet set calendar_cancelled_at=now(),calendar_cancelled_by=app.actor_account() where id=sheet.id;
  insert into app.day_exception as e(year_id,class_id,school_date,teaching,reason)
    values(sheet.year_id,sheet.class_id,sheet.school_date,false,'إلغاء يوم دراسي · Unterrichtstag abgesagt')
    on conflict on constraint day_exception_scope do update
      set teaching=false,reason=excluded.reason,revision=e.revision+1;
  for prior in select r.* from app.attendance_row r where r.sheet_id=sheet.id order by r.id for update
  loop
    select e.event_id into old_event from app.attendance_approved_event e where e.row_id=prior.id and e.row_revision=prior.revision;
    update app.attendance_row r set revision=r.revision+1 where r.id=prior.id returning r.revision into changed;
    insert into app.attendance_approved_revision(row_id,row_revision,previous_revision,change_kind,
      prior_status,resulting_status,actor_id,private_reason)
    values(prior.id,changed,prior.revision,'calendar_cancellation',prior.status,prior.status,app.actor_account(),btrim(explanation));
    return query select 'cancelled'::text,prior.id,prior.student_id,sheet.class_id,sheet.school_date,prior.status,changed,old_event;
  end loop;
  if not found then
    return query select 'cancelled'::text,null::uuid,null::uuid,sheet.class_id,sheet.school_date,null::app.attendance_status,null::integer,null::uuid;
  end if;
end
$$;
