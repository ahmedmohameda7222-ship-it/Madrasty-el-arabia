create function app.report_enrollment_context(pupil uuid,class_scope uuid,first_day date,last_day date)
returns table(enrollment_id uuid,student_id uuid,class_id uuid,class_code text,class_name_ar text,class_name_de text,
  year_id uuid,year_start date,year_end date,enrolled_from date,enrolled_until date)
language sql stable security definer set search_path=pg_catalog
as $$
  select e.id,e.student_id,c.id,c.code,c.name_ar,c.name_de,y.id,y.starts_on,y.ends_exclusive,e.effective_from,e.effective_until
  from app.enrollment e join app.school_class c on c.id=e.class_id join app.school_year y on y.id=c.year_id
  where e.voided_at is null and e.effective_from<=last_day and first_day<e.effective_until
    and (pupil is null or e.student_id=pupil) and (class_scope is null or c.id=class_scope)
    and (app.has_capability('academics.supervise')
      or (pupil is not null and app.has_child_link(e.student_id))
      or exists(select 1 from app.teacher_overview() t where t.class_id=c.id
        and t.capabilities && array['academics.plan','academics.log','academics.grade','academics.publish']
        and greatest(t.effective_from,e.effective_from,first_day)<=last_day
        and greatest(t.effective_from,e.effective_from,first_day)<least(t.effective_until,e.effective_until)))
$$;

create function app.report_pupils(pupil uuid,class_scope uuid,first_day date,last_day date,query text)
returns table(student_id uuid,student_name text,student_number text)
language sql stable security definer set search_path=pg_catalog
as $$
  select s.id,s.display_name,s.student_number from app.student s
  where (pupil is null or s.id=pupil)
    and (query is null or strpos(lower(s.display_name),lower(query))>0 or strpos(lower(s.student_number),lower(query))>0)
    and ((pupil is not null and app.has_child_link(s.id)) or
      (class_scope is null and app.has_capability('academics.supervise')) or
      exists(select 1 from app.report_enrollment_context(s.id,class_scope,first_day,last_day)))
$$;

create function app.report_subjects(pupil uuid,first_day date,last_day date)
returns table(subject_id uuid,subject_name_ar text,subject_name_de text)
language sql stable security definer set search_path=pg_catalog
as $$
  select distinct s.id,s.name_ar,s.name_de
  from app.report_enrollment_context(pupil,null,first_day,last_day) e
  join app.class_subject o on o.class_id=e.class_id join app.subject s on s.id=o.subject_id
  where app.has_capability('academics.supervise') or app.has_child_link(pupil) or exists(
    select 1 from app.teacher_overview() t where t.offering_id=o.id
      and t.capabilities && array['academics.plan','academics.log','academics.grade','academics.publish']
      and greatest(t.effective_from,e.enrolled_from,first_day)<=last_day
      and greatest(t.effective_from,e.enrolled_from,first_day)<least(t.effective_until,e.enrolled_until)
  )
$$;

create function app.academic_report_sources(pupil uuid,first_day date,last_day date,subject uuid)
returns table(
  source_kind text,source_id uuid,resource_id uuid,offering_id uuid,subject_id uuid,class_id uuid,year_id uuid,
  enrollment_id uuid,school_date date,period_from date,title_ar text,title_de text,status text,numerator numeric,maximum numeric,
  participation integer,understanding integer,preparation integer,revision integer,included boolean,inclusion_reason text,
  visibility text
)
language sql stable security definer set search_path=pg_catalog
as $$
  with pupil_scope as materialized (
    select * from app.report_pupils(pupil,null,first_day,last_day,null)
  ), contexts as materialized (
    select * from app.report_enrollment_context(pupil,null,first_day,last_day)
  ), source_rows as (
    select 'attendance'::text as kind,r.id as source_id,
      case when app.has_child_link(pupil) or app.attendance_scope(s.class_id,s.school_date,'attendance.read') then r.id end as resource_id,
      null::uuid as offering_id,null::uuid as subject_id,s.class_id,s.year_id,r.enrollment_id,s.school_date,
      null::date as period_from,null::text as title_ar,null::text as title_de,
      case when skip.cancelled then 'cancelled' else r.status::text end as status,
      null::numeric as numerator,null::numeric as maximum,null::integer as participation,null::integer as understanding,
      null::integer as preparation,r.revision,not skip.cancelled and r.status is not null as included,
      case when skip.cancelled then 'cancelled_day' when r.status is null then 'unmarked_day' else 'approved_day' end as inclusion_reason,
      'approved'::text as visibility
    from app.attendance_row r join app.attendance_sheet s on s.id=r.sheet_id join contexts e on e.enrollment_id=r.enrollment_id
    cross join lateral (select s.calendar_cancelled_at is not null or not app.is_teaching_day(s.class_id,s.school_date) as cancelled) skip
    where r.student_id=pupil and s.state='approved' and s.school_date between first_day and last_day and (
      app.has_capability('academics.supervise') or app.has_child_link(pupil)
      or exists(select 1 from app.teacher_overview() t where t.class_id=s.class_id
        and t.capabilities && array['academics.plan','academics.log','academics.grade','academics.publish']
        and t.effective_from<=s.school_date and s.school_date<t.effective_until)
    )
    union all
    select 'teaching',t.source_id,case when exists(select 1 from app.curriculum_projection(
        case when app.actor_persona()='guardian' then pupil end,null,log.lesson_id) k where k.id=log.lesson_id) then log.lesson_id end,
      t.offering_id,t.subject_id,t.class_id,t.year_id,t.enrollment_id,t.school_date,null,t.title_ar,t.title_de,
      null,null,null,null,null,null,t.revision,true,'delivered_lesson','recorded'
    from app.academic_teaching_sources(pupil,first_day,last_day,subject) t join app.teaching_log log on log.id=t.source_id
    union all
    select 'activity',a.source_id,a.activity_id,a.offering_id,a.subject_id,a.class_id,a.year_id,a.enrollment_id,a.school_date,
      null,a.title,a.title,null,a.score,a.max_score,null,null,null,a.revision,a.score is not null,
      case when a.score is null then 'missing_score' else 'recorded_score' end,'recorded'
    from app.academic_activity_sources(pupil,first_day,last_day,subject) a
    union all
    select 'homework',h.source_id,h.homework_id,h.offering_id,h.subject_id,h.class_id,h.year_id,h.enrollment_id,h.school_date,
      null,h.title,h.title,null,h.score,20::numeric,null,null,null,h.revision,h.score is not null,
      case when h.score is null then 'missing_score' else 'recorded_score' end,
      case when h.score is null then 'assigned' else 'recorded' end
    from app.academic_homework_sources(pupil,first_day,last_day,subject) h
    union all
    select 'evaluation',p.source_id,p.evaluation_id,p.offering_id,p.subject_id,p.class_id,p.year_id,p.enrollment_id,p.period_end,
      p.period_start,p.title,p.title,null,null,null,p.participation::integer,p.understanding::integer,p.preparation::integer,p.revision,
      true,'published_evaluation','published'
    from app.academic_evaluation_sources(pupil,first_day,last_day,subject) p
    union all
    select 'exam',x.source_id,x.exam_id,x.offering_id,x.subject_id,x.class_id,x.year_id,x.enrollment_id,x.exam_date,
      null,x.title,x.title,x.exam_kind,x.score,x.max_score,null,null,null,x.revision,true,'published_result','published'
    from app.academic_exam_sources(pupil,first_day,last_day,subject) x
  )
  select s.* from source_rows s
  where exists(select 1 from pupil_scope)
$$;

revoke all on function app.report_enrollment_context(uuid,uuid,date,date),app.report_pupils(uuid,uuid,date,date,text),
  app.report_subjects(uuid,date,date),app.academic_report_sources(uuid,date,date,uuid) from public,anon,authenticated,service_role;
grant execute on function app.report_enrollment_context(uuid,uuid,date,date),app.report_pupils(uuid,uuid,date,date,text),
  app.report_subjects(uuid,date,date),app.academic_report_sources(uuid,date,date,uuid) to app_runtime;
