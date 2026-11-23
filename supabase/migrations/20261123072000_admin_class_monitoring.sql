-- Admin teaching monitoring. Private read-only functions: publication is enforced in SQL.
-- This file is ONLY tested on disposable QA databases until a separate release gate.
create or replace function app.admin_monitor_classes(p_year uuid)
returns table("classId" uuid,"yearId" uuid,code text,"nameAr" text,"nameDe" text,
              "teacherName" text,"studentCount" integer,"lastAttendanceDate" text)
language sql stable security definer set search_path = pg_catalog as $$
  select c.id,c.year_id,c.code,c.name_ar,c.name_de,
    (select p.display_name from app.teaching_assignment t join app.staff_profile p on p.id=t.staff_id
      where t.class_id=c.id and t.kind='primary' and t.revoked_at is null
        and t.effective_from<=dates.as_of and dates.as_of<t.effective_until
      order by t.effective_from desc,t.id desc limit 1),
    (select count(distinct e.student_id)::integer from app.enrollment e
      where e.class_id=c.id and e.voided_at is null and e.effective_from<=dates.as_of
        and e.effective_until>dates.as_of),
    (select max(a.school_date)::text from app.attendance_sheet a
      where a.class_id=c.id and a.state='approved' and a.calendar_cancelled_at is null
        and a.school_date<=dates.as_of and app.is_teaching_day(c.id,a.school_date))
  from app.school_class c join app.school_year y on y.id=c.year_id
  cross join lateral (select greatest(y.starts_on,least(app.school_today(),y.ends_exclusive-1)) as as_of) dates
  where c.year_id=p_year and app.actor_persona()='admin'
    and app.has_capability('academics.supervise') and app.has_capability('attendance.supervise')
  order by c.code,c.id
$$;

create or replace function app.admin_class_monitor(p_class uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog as $$
with ctx as (
  select c.id,c.year_id,c.code,c.name_ar,c.name_de,
         greatest(y.starts_on,least(app.school_today(),y.ends_exclusive-1)) as as_of,
         (select p.display_name from app.teaching_assignment t join app.staff_profile p on p.id=t.staff_id
          where t.class_id=c.id and t.kind='primary' and t.revoked_at is null
            and t.effective_from<=greatest(y.starts_on,least(app.school_today(),y.ends_exclusive-1))
            and greatest(y.starts_on,least(app.school_today(),y.ends_exclusive-1))<t.effective_until
          order by t.effective_from desc,t.id desc limit 1) as teacher
  from app.school_class c join app.school_year y on y.id=c.year_id
  where c.id=p_class and app.actor_persona()='admin'
    and app.has_capability('academics.supervise') and app.has_capability('attendance.supervise')
)
select jsonb_build_object(
  'classroom',jsonb_build_object('classId',c.id,'yearId',c.year_id,'code',c.code,
    'nameAr',c.name_ar,'nameDe',c.name_de,'teacherName',c.teacher),
  'students',coalesce((
    select jsonb_agg(jsonb_build_object('studentId',p.id,'name',p.display_name,
      'number',p.student_number) order by p.display_name,p.id)
    from app.enrollment e join app.student p on p.id=e.student_id
    where e.class_id=c.id and e.voided_at is null and e.effective_from<=c.as_of and c.as_of<e.effective_until
  ),'[]'::jsonb),
  'lastAttendance',(
    select jsonb_build_object('date',a.school_date::text,
      'present',count(*) filter(where r.status='present'),
      'late',count(*) filter(where r.status='late'),
      'absentUnexcused',count(*) filter(where r.status='absent_unexcused'),
      'absentExcused',count(*) filter(where r.status='absent_excused'))
    from app.attendance_sheet a join app.attendance_row r on r.sheet_id=a.id
    where a.class_id=c.id and a.state='approved' and a.calendar_cancelled_at is null
      and app.is_teaching_day(c.id,a.school_date)
    group by a.id,a.school_date order by a.school_date desc limit 1
  ),
  'attendance',coalesce((
    select jsonb_agg(jsonb_build_object('studentId',r.student_id,'date',a.school_date::text,
      'status',r.status::text) order by a.school_date desc,r.student_id)
    from app.attendance_sheet a join app.attendance_row r on r.sheet_id=a.id
    where a.class_id=c.id and a.state='approved' and a.calendar_cancelled_at is null
      and app.is_teaching_day(c.id,a.school_date)
  ),'[]'::jsonb),
  'exams',coalesce((
    select jsonb_agg(jsonb_build_object('id',e.id,'title',a.title,'date',a.exam_date::text,
      'time',left(a.exam_time::text,5),'kind',a.exam_kind,'maxScore',a.max_score,
      'subjectAr',s.name_ar,'subjectDe',s.name_de,
      'publishedCount',(select count(*)::integer from app.exam_result r
        where r.exam_id=e.id and r.published_id is not null),
      'publishedResults',coalesce((select jsonb_agg(jsonb_build_object(
        'studentId',student.id,'studentName',student.display_name,
        'score',publication.score,'maxScore',publication.max_score,'feedback',publication.feedback)
        order by student.display_name,student.id)
        from app.exam_result result
        join app.exam_result_publication publication on publication.id=result.published_id
        join app.student student on student.id=result.student_id
        where result.exam_id=e.id),'[]'::jsonb))
      order by a.exam_date desc,e.id)
    from app.exam e join app.exam_announcement a on a.id=e.announced_id
    join app.class_subject o on o.id=e.offering_id join app.subject s on s.id=o.subject_id
    where o.class_id=c.id
  ),'[]'::jsonb),
  'homework',coalesce((
    select jsonb_agg(jsonb_build_object('id',h.id,'title',h.title,'instructions',h.instructions,
      'issuedOn',h.issued_on::text,'dueOn',h.due_on::text,'subjectAr',s.name_ar,
      'subjectDe',s.name_de,'publishedCount',(select count(*)::integer from app.homework_roster r
        where r.homework_id=h.id and r.marked_at is not null),
      'publishedResults',coalesce((select jsonb_agg(jsonb_build_object(
        'studentId',student.id,'studentName',student.display_name,'score',row.score,
        'maxScore',20,'feedback',row.feedback) order by student.display_name,student.id)
        from app.homework_roster row join app.student student on student.id=row.student_id
        where row.homework_id=h.id and row.marked_at is not null),'[]'::jsonb))
      order by h.issued_on desc,h.id)
    from app.homework h join app.class_subject o on o.id=h.offering_id
    join app.subject s on s.id=o.subject_id where o.class_id=c.id
  ),'[]'::jsonb),
  'activities',coalesce((
    select jsonb_agg(jsonb_build_object('id',a.id,'title',a.title,'date',a.activity_date::text,
      'maxScore',a.max_score,'subjectAr',s.name_ar,'subjectDe',s.name_de,
      'publishedCount',(select count(*)::integer from app.activity_mark m
        where m.activity_id=a.id and m.visible_at is not null),
      'publishedResults',coalesce((select jsonb_agg(jsonb_build_object(
        'studentId',student.id,'studentName',student.display_name,'score',mark.score,
        'maxScore',a.max_score,'feedback',null) order by student.display_name,student.id)
        from app.activity_mark mark join app.student student on student.id=mark.student_id
        where mark.activity_id=a.id and mark.visible_at is not null),'[]'::jsonb))
      order by a.activity_date desc,a.id)
    from app.assessed_activity a join app.class_subject o on o.id=a.offering_id
    join app.subject s on s.id=o.subject_id where o.class_id=c.id
  ),'[]'::jsonb),
  'evaluations',coalesce((
    select jsonb_agg(jsonb_build_object('id',v.id,'studentId',p.id,'studentName',p.display_name,
      'title',publication.title,'periodStart',v.period_start::text,
      'periodEnd',v.period_end::text,'publishedAt',publication.published_at,
      'participation',publication.participation,'understanding',publication.understanding,
      'preparation',publication.preparation,'strengths',publication.strengths,
      'improvements',publication.improvements,'subjectAr',s.name_ar,'subjectDe',s.name_de)
      order by v.period_end desc,v.id)
    from app.student_evaluation v
    join app.evaluation_publication publication on publication.id=v.current_publication_id
    join app.student p on p.id=v.student_id
    join app.class_subject o on o.id=v.offering_id join app.subject s on s.id=o.subject_id
    where o.class_id=c.id
  ),'[]'::jsonb),
  'teaching',coalesce((
    select jsonb_agg(jsonb_build_object('id',l.id,'date',l.actual_date::text,
      'notes',l.delivered_notes,'recordedAt',l.recorded_at,'teacher',p.display_name,
      'subjectAr',s.name_ar,'subjectDe',s.name_de)
      order by l.actual_date desc,l.id)
    from app.teaching_log l join app.class_subject o on o.id=l.offering_id
    join app.subject s on s.id=o.subject_id
    left join app.staff_profile p on p.account_id=l.recorded_by
    where o.class_id=c.id and l.recorded_at is not null
  ),'[]'::jsonb)
)
from ctx c
$$;

create or replace function app.admin_student_monitor(p_class uuid,p_student uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog as $$
with ctx as (
  select c.id as class_id,c.code as class_code,c.name_ar,c.name_de,c.year_id,
         p.id as student_id,p.display_name,p.student_number
  from app.school_class c join app.student p on p.id=p_student
  where c.id=p_class and app.actor_persona()='admin'
    and app.has_capability('academics.supervise') and app.has_capability('attendance.supervise')
    and exists(select 1 from app.enrollment e where e.class_id=c.id
      and e.student_id=p.id and e.voided_at is null)
)
select jsonb_build_object(
  'student',jsonb_build_object('studentId',c.student_id,'name',c.display_name,
    'number',c.student_number,'classId',c.class_id,'classCode',c.class_code,
    'classNameAr',c.name_ar,'classNameDe',c.name_de,'yearId',c.year_id),
  'attendance',coalesce((
    select jsonb_agg(jsonb_build_object('date',a.school_date::text,'status',r.status::text)
      order by a.school_date desc)
    from app.attendance_sheet a join app.attendance_row r on r.sheet_id=a.id
    where a.class_id=c.class_id and r.student_id=c.student_id and a.state='approved'
      and a.calendar_cancelled_at is null and app.is_teaching_day(c.class_id,a.school_date)
  ),'[]'::jsonb),
  'exams',coalesce((
    select jsonb_agg(jsonb_build_object('id',e.id,'title',p.title,'date',p.exam_date::text,
      'score',p.score,'maxScore',p.max_score,'feedback',p.feedback,'publishedAt',batch.published_at,
      'subjectAr',s.name_ar,'subjectDe',s.name_de)
      order by p.exam_date desc,e.id)
    from app.exam_result r join app.exam e on e.id=r.exam_id
    join app.exam_announcement announcement on announcement.id=e.announced_id
    join app.exam_result_publication p on p.id=r.published_id
    join app.exam_result_batch batch on batch.id=p.batch_id
    join app.class_subject o on o.id=e.offering_id join app.subject s on s.id=o.subject_id
    where o.class_id=c.class_id and r.student_id=c.student_id
  ),'[]'::jsonb),
  'homework',coalesce((
    select jsonb_agg(jsonb_build_object('id',h.id,'title',h.title,'issuedOn',h.issued_on::text,
      'dueOn',h.due_on::text,'score',case when r.marked_at is not null then r.score else null end,
      'feedback',case when r.marked_at is not null then r.feedback else null end,
      'subjectAr',s.name_ar,'subjectDe',s.name_de)
      order by h.issued_on desc,h.id)
    from app.homework_roster r join app.homework h on h.id=r.homework_id
    join app.class_subject o on o.id=h.offering_id join app.subject s on s.id=o.subject_id
    where o.class_id=c.class_id and r.student_id=c.student_id
  ),'[]'::jsonb),
  'activities',coalesce((
    select jsonb_agg(jsonb_build_object('id',a.id,'title',a.title,'date',a.activity_date::text,
      'maxScore',a.max_score,'score',case when m.visible_at is not null then m.score else null end,
      'subjectAr',s.name_ar,'subjectDe',s.name_de)
      order by a.activity_date desc,a.id)
    from app.assessed_activity a join app.class_subject o on o.id=a.offering_id
    join app.subject s on s.id=o.subject_id
    left join app.activity_mark m on m.activity_id=a.id and m.student_id=c.student_id
    where o.class_id=c.class_id
  ),'[]'::jsonb),
  'evaluations',coalesce((
    select jsonb_agg(jsonb_build_object('id',v.id,'title',p.title,'periodStart',v.period_start::text,
      'periodEnd',v.period_end::text,'publishedAt',p.published_at,
      'participation',p.participation,'understanding',p.understanding,'preparation',p.preparation,
      'strengths',p.strengths,'improvements',p.improvements,
      'subjectAr',s.name_ar,'subjectDe',s.name_de)
      order by v.period_end desc,v.id)
    from app.student_evaluation v join app.evaluation_publication p on p.id=v.current_publication_id
    join app.class_subject o on o.id=v.offering_id join app.subject s on s.id=o.subject_id
    where o.class_id=c.class_id and v.student_id=c.student_id
  ),'[]'::jsonb)
)
from ctx c
$$;

-- Replace the previous aggregate implementation: announced exams and published marks ONLY.
create or replace function app.admin_class_oversight(scope_day date)
returns table(class_id uuid,year_id uuid,class_code text,class_name_ar text,class_name_de text,
  teacher_name text,attendance_state text,unmarked_count integer,teaching_entries integer,
  active_homework integer,upcoming_exams integer,marked_exam_results integer)
language sql stable security definer set search_path = pg_catalog as $$
  with rights as (
    select app.has_capability('attendance.supervise') as attendance,
           app.has_capability('academics.supervise') as academics
  )
  select c.id,c.year_id,c.code,c.name_ar,c.name_de,
    (select p.display_name from app.teaching_assignment t join app.staff_profile p on p.id=t.staff_id
      where t.class_id=c.id and t.kind='primary' and t.revoked_at is null
        and t.effective_from<=scope_day and scope_day<t.effective_until
      order by t.effective_from desc limit 1),
    case when rights.attendance then
      coalesce((select s.state from app.attendance_sheet s
        where s.class_id=c.id and s.school_date=scope_day),'not_started') else null end,
    case when rights.attendance then
      (select count(*)::integer from app.attendance_sheet sh
        join app.attendance_row r on r.sheet_id=sh.id
        where sh.class_id=c.id and sh.school_date=scope_day and sh.state='approved'
          and sh.calendar_cancelled_at is null and r.status is null)
      else null end,
    case when rights.academics then
      (select count(*)::integer from app.teaching_log l
        join app.class_subject o on o.id=l.offering_id
        where o.class_id=c.id and l.actual_date=scope_day and l.recorded_at is not null)
      else null end,
    case when rights.academics then
      (select count(*)::integer from app.homework h
        join app.class_subject o on o.id=h.offering_id
        where o.class_id=c.id and h.issued_on<=scope_day and h.due_on>=scope_day)
      else null end,
    case when rights.academics then
      (select count(*)::integer from app.exam e
        join app.exam_announcement a on a.id=e.announced_id
        join app.class_subject o on o.id=e.offering_id
        where o.class_id=c.id and a.exam_date>=scope_day and a.exam_date<scope_day+14)
      else null end,
    case when rights.academics then
      (select count(*)::integer from app.exam_result r
        join app.exam e on e.id=r.exam_id
        join app.exam_announcement a on a.id=e.announced_id
        join app.class_subject o on o.id=e.offering_id
        where o.class_id=c.id and a.exam_date between scope_day-30 and scope_day
          and r.published_id is not null)
      else null end
  from app.school_class c join app.school_year y on y.id=c.year_id
  cross join rights
  where app.actor_persona()='admin' and (rights.attendance or rights.academics)
    and scope_day>=y.starts_on and scope_day<y.ends_exclusive
  order by c.code,c.id
$$;

revoke all on function app.admin_monitor_classes(uuid) from public,anon,authenticated;
revoke all on function app.admin_class_monitor(uuid) from public,anon,authenticated;
revoke all on function app.admin_student_monitor(uuid,uuid) from public,anon,authenticated;
grant execute on function app.admin_monitor_classes(uuid) to app_runtime;
grant execute on function app.admin_class_monitor(uuid) to app_runtime;
grant execute on function app.admin_student_monitor(uuid,uuid) to app_runtime;
