create table app.teaching_log (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references app.class_subject,
  assignment_id uuid not null references app.teaching_assignment,
  lesson_id uuid references app.curriculum_lesson,
  lesson_version_id uuid,
  actual_date date not null,
  delivered_notes text not null check(char_length(btrim(delivered_notes)) between 1 and 12000),
  recorded_by uuid not null references app.account,
  recorded_at timestamptz not null default now(),
  editor_id uuid not null references app.account,
  revision integer not null default 1 check(revision>=1),
  check(lesson_version_id is null or lesson_id is not null),
  foreign key(lesson_id,lesson_version_id) references app.curriculum_publication(lesson_id,id)
);
create index teaching_log_offering_date_idx on app.teaching_log(offering_id,actual_date desc,id);
create index teaching_log_lesson_date_idx on app.teaching_log(lesson_id,actual_date desc) where lesson_id is not null;

create table app.assessed_activity (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references app.class_subject,
  activity_date date not null,
  title text not null check(char_length(btrim(title)) between 1 and 200),
  max_score numeric not null check(max_score>0 and max_score<=1000000 and scale(max_score)<=4),
  recorded_by uuid not null references app.account,
  recorded_at timestamptz not null default now()
);
create index assessed_activity_offering_idx on app.assessed_activity(offering_id,activity_date desc,id);

create table app.activity_mark (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references app.assessed_activity,
  student_id uuid not null references app.student,
  enrollment_id uuid not null references app.enrollment,
  score numeric check(score>=0 and score<=1000000 and scale(score)<=4),
  visible_at timestamptz not null,
  recorded_by uuid not null references app.account,
  recorded_at timestamptz not null default now(),
  revision integer not null check(revision>=2),
  unique(activity_id,student_id)
);
create index activity_mark_child_idx on app.activity_mark(student_id,activity_id);
create index activity_mark_enrollment_idx on app.activity_mark(enrollment_id);
create table app.activity_mark_correction (
  mark_id uuid not null references app.activity_mark,
  revision integer not null check(revision>=3),
  previous_score numeric,
  score numeric,
  actor_id uuid not null references app.account,
  occurred_at timestamptz not null default now(),
  private_reason text not null check(char_length(btrim(private_reason)) between 1 and 500),
  primary key(mark_id,revision),
  check(previous_score is distinct from score)
);

alter table app.teaching_log enable row level security;
alter table app.assessed_activity enable row level security;
alter table app.activity_mark enable row level security;
alter table app.activity_mark_correction enable row level security;

create function app.protect_graded_activity_enrollment() returns trigger
language plpgsql security definer set search_path=pg_catalog
as $$
begin
  if exists(
    select 1 from app.activity_mark m join app.assessed_activity a on a.id=m.activity_id
    where m.enrollment_id=old.id and (new.voided_at is not null or new.student_id<>old.student_id
      or new.class_id<>old.class_id or a.activity_date<new.effective_from or a.activity_date>=new.effective_until)
  ) then raise exception 'Enrollment includes recorded activity evidence' using errcode='23P01'; end if;
  return new;
end
$$;
create trigger protect_graded_activity_enrollment after update on app.enrollment
for each row execute function app.protect_graded_activity_enrollment();

create function app.academic_staff_assignments(target_offering uuid,local_day date)
returns table(id uuid,teacher_name text)
language sql stable security definer set search_path=pg_catalog
as $$
  select t.id,p.display_name from app.teaching_assignment t
  join app.staff_profile p on p.id=t.staff_id
  where t.offering_id=target_offering and t.revoked_at is null
    and t.effective_from<=local_day and local_day<t.effective_until and 'academics.log'=any(t.capabilities)
    and app.academic_offering_scope(target_offering,local_day,'academics.log')
    and (app.has_capability('academics.supervise') or exists(
      select 1 from app.staff_profile acting where acting.account_id=app.actor_account()
        and app.teacher_applies(t.id,acting.id,local_day,'academics.log')
        and app.teacher_applies(t.id,acting.id,app.school_today(),'academics.log')
    ))
$$;

create function app.academic_writable_day(target_offering uuid,local_day date,operation text)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
  select local_day<=app.school_today() and app.academic_offering_scope(target_offering,local_day,operation)
    and exists (
      select 1 from app.class_subject o join app.school_class c on c.id=o.class_id
        join app.school_year y on y.id=c.year_id
      where o.id=target_offering and y.state='active' and app.is_teaching_day(c.id,local_day)
    )
$$;

create function app.teaching_log_rows(target_offering uuid,target uuid)
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
    and app.academic_offering_scope(l.offering_id,l.actual_date,'academics.log')
$$;

create function app.write_teaching_log(
  target uuid,target_offering uuid,selected_assignment uuid,actual_day date,notes text,planned_lesson uuid,
  published_version uuid,expected_revision integer
) returns table(id uuid,revision integer)
language plpgsql security definer set search_path=pg_catalog
as $$
declare current_row app.teaching_log%rowtype;
declare matching_assignment uuid;
declare alternate uuid[];
declare source_lesson uuid;
declare class_ref uuid;
begin
  perform app.lock_school_calendar();
  if target is not null then
    select t.* into current_row from app.teaching_log t where t.id=target for update;
    if not found or not app.academic_offering_scope(current_row.offering_id,current_row.actual_date,'academics.log') then
      raise exception 'Teaching log is unavailable' using errcode='42501';
    end if;
    if current_row.revision<>expected_revision then return; end if;
    target_offering:=current_row.offering_id;
  end if;
  if not app.academic_writable_day(target_offering,actual_day,'academics.log') then
    raise exception 'Teaching date is outside scope or closed' using errcode='23P01';
  end if;
  select o.class_id into class_ref from app.class_subject o where o.id=target_offering;
  perform app.lock_classes(class_ref);
  if not exists(select 1 from app.enrollment e where e.class_id=class_ref and e.voided_at is null
    and e.effective_from<=actual_day and actual_day<e.effective_until) then
    raise exception 'No enrolled students for this class on this date' using errcode='23P01';
  end if;
  select array_agg(a.id order by a.id) into alternate from app.academic_staff_assignments(target_offering,actual_day) a;
  matching_assignment:=coalesce(selected_assignment,
    case when current_row.assignment_id=any(alternate) then current_row.assignment_id end,
    case when cardinality(alternate)=1 then alternate[1] end);
  if matching_assignment is null or not coalesce(matching_assignment=any(alternate),false) then
    raise exception 'A dated teaching assignment is required' using errcode='23514';
  end if;
  if published_version is not null then
    select p.lesson_id into source_lesson from app.curriculum_publication p join app.curriculum_lesson l on l.id=p.lesson_id
      where p.id=published_version and l.offering_id=target_offering;
    if not found or (planned_lesson is not null and planned_lesson<>source_lesson) then
      raise exception 'Published lesson is outside offering' using errcode='23514';
    end if;
  elsif planned_lesson is not null then
    select l.id into source_lesson from app.curriculum_lesson l where l.id=planned_lesson and l.offering_id=target_offering;
    if not found then raise exception 'Planned lesson is outside offering' using errcode='23514'; end if;
  end if;
  if target is null then
    return query insert into app.teaching_log as t(offering_id,assignment_id,lesson_id,lesson_version_id,actual_date,delivered_notes,recorded_by,editor_id)
      values(target_offering,matching_assignment,source_lesson,published_version,actual_day,btrim(notes),app.actor_account(),app.actor_account())
      returning t.id,t.revision;
  else
    return query update app.teaching_log t set assignment_id=matching_assignment,lesson_id=source_lesson,lesson_version_id=published_version,
      actual_date=actual_day,delivered_notes=btrim(notes),editor_id=app.actor_account(),revision=t.revision+1
      where t.id=target returning t.id,t.revision;
  end if;
end
$$;

create function app.curriculum_delivery_date(child uuid,lesson uuid)
returns date language sql stable security definer set search_path=pg_catalog
as $$
  select max(t.actual_date) from app.teaching_log t
  where t.lesson_id=lesson and (
    (child is null and app.academic_offering_scope(t.offering_id,t.actual_date))
    or (child is not null and app.academic_child_offering(child,t.offering_id,t.actual_date)
      and exists(select 1 from app.curriculum_lesson l where l.id=lesson and l.published_id is not null))
  )
$$;

create function app.new_assessed_activity(target_offering uuid,score_day date,activity_title text,maximum numeric)
returns uuid language plpgsql security definer set search_path=pg_catalog
as $$
declare created uuid;
begin
  perform app.lock_school_calendar();
  if not app.academic_writable_day(target_offering,score_day,'academics.grade') then
    raise exception 'Activity date is outside scope or closed' using errcode='23P01';
  end if;
  insert into app.assessed_activity(offering_id,activity_date,title,max_score,recorded_by)
    values(target_offering,score_day,btrim(activity_title),maximum,app.actor_account()) returning id into created;
  return created;
end
$$;

create function app.assessed_activity_rows(child uuid,target_offering uuid,target uuid)
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
    and ((child is null and app.academic_offering_scope(a.offering_id,a.activity_date,'academics.grade'))
      or (child is not null and m.id is not null and app.academic_child_offering(child,a.offering_id,a.activity_date)))
$$;

create function app.assessed_activity_roster(target uuid)
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
  where a.id=target and app.academic_offering_scope(a.offering_id,a.activity_date,'academics.grade')
$$;

create function app.write_activity_mark(target uuid,student uuid,expected_revision integer,new_score numeric,correction_reason text)
returns table(mark_id uuid,score numeric,revision integer,changed boolean,correction boolean)
language plpgsql security definer set search_path=pg_catalog
as $$
declare activity app.assessed_activity%rowtype;
declare previous app.activity_mark%rowtype;
declare result app.activity_mark%rowtype;
declare class_ref uuid;
declare enrollment_ref uuid;
begin
  perform app.lock_school_calendar();
  select a.* into activity from app.assessed_activity a where a.id=target;
  if not found or not app.academic_writable_day(activity.offering_id,activity.activity_date,'academics.grade') then
    raise exception 'Activity is outside scope or closed' using errcode='42501';
  end if;
  select o.class_id into class_ref from app.class_subject o where o.id=activity.offering_id;
  perform app.lock_classes(class_ref);
  select e.id into enrollment_ref from app.enrollment e where e.class_id=class_ref and e.student_id=student
    and e.voided_at is null and e.effective_from<=activity.activity_date and activity.activity_date<e.effective_until;
  if not found then raise exception 'Student is outside the dated roster' using errcode='42501'; end if;
  select m.* into previous from app.activity_mark m where m.activity_id=target and m.student_id=student for update;
  if coalesce(previous.revision,1)<>expected_revision then return; end if;
  if new_score is not null and (new_score<0 or new_score>activity.max_score or scale(new_score)>4) then
    raise exception 'Score exceeds allowed bounds' using errcode='23514';
  end if;
  if new_score is not distinct from previous.score then
    return query select previous.id,previous.score,coalesce(previous.revision,1),false,false;
    return;
  end if;
  if previous.id is null then
    insert into app.activity_mark(activity_id,student_id,enrollment_id,score,visible_at,recorded_by,revision)
      values(target,student,enrollment_ref,new_score,now(),app.actor_account(),2) returning * into result;
    return query select result.id,result.score,result.revision,true,false;
  else
    if coalesce(char_length(btrim(correction_reason)),0) not between 1 and 500 then
      raise exception 'A reason is required for a visible correction' using errcode='23514';
    end if;
    update app.activity_mark m set score=new_score,recorded_by=app.actor_account(),recorded_at=now(),revision=m.revision+1
      where m.id=previous.id returning * into result;
    insert into app.activity_mark_correction(mark_id,revision,previous_score,score,actor_id,private_reason)
      values(result.id,result.revision,previous.score,new_score,app.actor_account(),btrim(correction_reason));
    return query select result.id,result.score,result.revision,true,true;
  end if;
end
$$;

create function app.activity_correction_rows(target uuid,student uuid)
returns table(revision integer,previous_score numeric,score numeric,actor_name text,occurred_at timestamptz,reason text)
language sql stable security definer set search_path=pg_catalog
as $$
  select h.revision,h.previous_score,h.score,p.display_name,h.occurred_at,h.private_reason
  from app.activity_mark m join app.activity_mark_correction h on h.mark_id=m.id
  join app.assessed_activity a on a.id=m.activity_id left join app.staff_profile p on p.account_id=h.actor_id
  where m.activity_id=target and m.student_id=student
    and app.academic_offering_scope(a.offering_id,a.activity_date,'academics.grade')
$$;

create function app.academic_teaching_sources(student uuid,date_from date,date_to date,subject uuid)
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
    and (app.academic_offering_scope(o.id,t.actual_date,'academics.log') or app.academic_child_offering(student,o.id,t.actual_date))
$$;

create function app.academic_activity_sources(student uuid,date_from date,date_to date,subject uuid)
returns table(source_kind text,source_id uuid,activity_id uuid,offering_id uuid,subject_id uuid,class_id uuid,year_id uuid,
  enrollment_id uuid,school_date date,title text,score numeric,max_score numeric,revision integer)
language sql stable security definer set search_path=pg_catalog
as $$
  select 'activity'::text,m.id,a.id,o.id,o.subject_id,c.id,c.year_id,m.enrollment_id,a.activity_date,a.title,m.score,a.max_score,m.revision
  from app.activity_mark m join app.assessed_activity a on a.id=m.activity_id
  join app.class_subject o on o.id=a.offering_id join app.school_class c on c.id=o.class_id
  where m.student_id=student and a.activity_date between date_from and date_to and (subject is null or o.subject_id=subject)
    and (app.academic_offering_scope(o.id,a.activity_date,'academics.grade') or app.academic_child_offering(student,o.id,a.activity_date))
$$;

insert into app.audit_action_rule(action,resource_kind,change_category,allowed_capabilities) values
  ('academics.teaching_logged','academics','creation',array['academics.supervise']),
  ('academics.teaching_updated','academics','update',array['academics.supervise']),
  ('academics.activity_created','academics','creation',array['academics.supervise']),
  ('academics.activity_scored','academics','creation',array['academics.supervise']),
  ('academics.activity_corrected','academics','correction',array['academics.supervise']);

revoke all on function app.protect_graded_activity_enrollment(),app.academic_staff_assignments(uuid,date),
  app.academic_writable_day(uuid,date,text),app.teaching_log_rows(uuid,uuid),
  app.write_teaching_log(uuid,uuid,uuid,date,text,uuid,uuid,integer),app.curriculum_delivery_date(uuid,uuid),
  app.new_assessed_activity(uuid,date,text,numeric),app.assessed_activity_rows(uuid,uuid,uuid),app.assessed_activity_roster(uuid),
  app.write_activity_mark(uuid,uuid,integer,numeric,text),app.activity_correction_rows(uuid,uuid),
  app.academic_teaching_sources(uuid,date,date,uuid),app.academic_activity_sources(uuid,date,date,uuid)
from public,anon,authenticated,service_role;
grant execute on function app.academic_staff_assignments(uuid,date),app.academic_writable_day(uuid,date,text),app.teaching_log_rows(uuid,uuid),
  app.write_teaching_log(uuid,uuid,uuid,date,text,uuid,uuid,integer),app.curriculum_delivery_date(uuid,uuid),
  app.new_assessed_activity(uuid,date,text,numeric),app.assessed_activity_rows(uuid,uuid,uuid),app.assessed_activity_roster(uuid),
  app.write_activity_mark(uuid,uuid,integer,numeric,text),app.activity_correction_rows(uuid,uuid),
  app.academic_teaching_sources(uuid,date,date,uuid),app.academic_activity_sources(uuid,date,date,uuid) to app_runtime;
