create table app.homework_grade_correction (
  roster_id uuid not null references app.homework_roster,
  revision integer not null check(revision>=2),
  previous_score numeric,
  score numeric,
  previous_feedback text,
  feedback text,
  actor_id uuid not null references app.account,
  occurred_at timestamptz not null default now(),
  private_reason text not null check(char_length(btrim(private_reason)) between 1 and 500),
  primary key(roster_id,revision),
  check((previous_score,previous_feedback) is distinct from (score,feedback))
);
alter table app.homework_grade_correction enable row level security;

create function app.homework_grade_rows(target uuid)
returns table(roster_id uuid,student_id uuid,student_name text,student_number text,joined_on date,added_later boolean,
  score numeric,feedback text,revision integer,visible boolean,can_edit boolean,corrected boolean)
language sql stable security definer set search_path=pg_catalog
as $$
  select r.id,s.id,s.display_name,s.student_number,r.joined_on,r.added_later,r.score,r.feedback,r.revision,r.marked_at is not null,
    y.state='active',exists(select 1 from app.homework_grade_correction a where a.roster_id=r.id)
  from app.homework h join app.class_subject o on o.id=h.offering_id
  join app.school_class c on c.id=o.class_id join app.school_year y on y.id=c.year_id
  join app.homework_roster r on r.homework_id=h.id join app.student s on s.id=r.student_id join app.enrollment e on e.id=r.enrollment_id
  where h.id=target and app.homework_staff_scope(h.offering_id,h.issued_on,'academics.grade')
    and app.homework_roster_available(r.joined_on,h.issued_on,e.effective_from,e.effective_until,e.voided_at,r.marked_at,app.school_today())
$$;

create function app.homework_grade_inbox(school_class uuid)
returns table(homework_id uuid,offering_id uuid,class_id uuid,class_code text,subject_name_ar text,subject_name_de text,
  title text,issued_on date,due_on date,graded integer,total integer,can_edit boolean)
language sql stable security definer set search_path=pg_catalog
as $$
  select a.id,a.offering_id,a.class_id,a.class_code,a.subject_name_ar,a.subject_name_de,
    a.title,a.issued_on,a.due_on,stats.graded,stats.total,a.can_grade
  from app.homework_projection(null,school_class,null,null) a
  cross join lateral (select count(*) filter(where g.score is not null)::int graded,count(*)::int total
    from app.homework_grade_rows(a.id) g) stats
  where a.issued_on<=app.school_today() and app.homework_staff_scope(a.offering_id,a.issued_on,'academics.grade')
$$;

create function app.homework_grade_history(target uuid,pupil uuid)
returns table(revision integer,previous_score numeric,score numeric,previous_feedback text,feedback text,
  actor_name text,occurred_at timestamptz,reason text)
language sql stable security definer set search_path=pg_catalog
as $$
  select h.revision,h.previous_score,h.score,h.previous_feedback,h.feedback,p.display_name,h.occurred_at,h.private_reason
  from app.homework_grade_rows(target) r join app.homework_grade_correction h on h.roster_id=r.roster_id
  left join app.staff_profile p on p.account_id=h.actor_id where r.student_id=pupil
$$;

create function app.write_homework_grades(target uuid,reviewed jsonb)
returns table(student_id uuid,roster_id uuid,revision integer,outcome text,correction boolean)
language plpgsql security definer set search_path=pg_catalog
as $$
declare assignment app.homework%rowtype;
declare class_ref uuid;
declare open_year boolean;
declare updates jsonb;
declare change jsonb;
declare previous app.homework_roster%rowtype;
declare next_score numeric;
declare next_feedback text;
declare proposed_score numeric;
declare current_revision integer;
declare current_pupil uuid;
declare submitted_revision integer;
declare reason text;
declare invalid boolean:=false;
begin
  perform app.lock_school_calendar();
  select h.* into assignment from app.homework h where h.id=target for update;
  if not found or not app.homework_staff_scope(assignment.offering_id,assignment.issued_on,'academics.grade') then
    raise exception 'Homework grading is outside scope' using errcode='42501';
  end if;
  select c.id,y.state='active' into class_ref,open_year from app.class_subject o join app.school_class c on c.id=o.class_id
    join app.school_year y on y.id=c.year_id where o.id=assignment.offering_id;
  if not open_year or assignment.issued_on>app.school_today() then
    raise exception 'Grading is read-only' using errcode='23P01';
  end if;
  perform app.lock_classes(class_ref);

  if jsonb_typeof(reviewed) is distinct from 'array' then
    raise exception 'Homework grades require reviewed rows' using errcode='23514';
  end if;
  if jsonb_array_length(reviewed) not between 1 and 1000
    or jsonb_array_length(reviewed)<>(select count(distinct v->>'studentId') from jsonb_array_elements(reviewed) v)
  then raise exception 'Homework grades require distinct reviewed rows' using errcode='23514'; end if;

  updates:='[]'::jsonb;
  for change in select v from jsonb_array_elements(reviewed) v order by v->>'studentId'
  loop
    current_pupil:=(change->>'studentId')::uuid;
    submitted_revision:=(change->>'revision')::integer;
    reason:=nullif(btrim(change->>'reasonIfCorrection'),'');
    select r.* into previous from app.homework_roster r join app.enrollment e on e.id=r.enrollment_id
      where r.homework_id=target and r.student_id=current_pupil
        and app.homework_roster_available(r.joined_on,assignment.issued_on,e.effective_from,e.effective_until,e.voided_at,r.marked_at,app.school_today())
      for update of r;
    if not found then
      invalid:=true;
      return query select current_pupil,null::uuid,null::integer,'unavailable'::text,false;
      continue;
    end if;
    if submitted_revision is distinct from previous.revision then
      invalid:=true;
      return query select current_pupil,previous.id,previous.revision,'stale'::text,false;
      continue;
    end if;
    if change ? 'score' and jsonb_typeof(change->'score') not in ('number','null') then
      invalid:=true;
      return query select current_pupil,previous.id,previous.revision,'score'::text,false;
      continue;
    end if;
    proposed_score:=(change->>'score')::numeric;
    if proposed_score is not null and (proposed_score<0 or proposed_score>20 or proposed_score*2<>trunc(proposed_score*2)) then
      invalid:=true;
      return query select current_pupil,previous.id,previous.revision,'score'::text,false;
      continue;
    end if;
    if change ? 'feedback' and (jsonb_typeof(change->'feedback') not in ('string','null') or char_length(change->>'feedback')>3000) then
      invalid:=true;
      return query select current_pupil,previous.id,previous.revision,'feedback'::text,false;
      continue;
    end if;

    next_score:=case when change ? 'score' then proposed_score else previous.score end;
    next_feedback:=case when change ? 'feedback' then nullif(btrim(change->>'feedback'),'') else previous.feedback end;
    if (next_score,next_feedback) is not distinct from (previous.score,previous.feedback) then
      return query select current_pupil,previous.id,previous.revision,'unchanged'::text,false;
      continue;
    end if;
    if previous.marked_at is not null and coalesce(char_length(reason),0) not between 1 and 500 then
      invalid:=true;
      return query select current_pupil,previous.id,previous.revision,'reason'::text,false;
      continue;
    end if;
    updates:=updates||jsonb_build_array(jsonb_build_object('id',previous.id,'score',next_score,'feedback',next_feedback,'reason',reason));
  end loop;

  if invalid then return; end if;

  for change in select v from jsonb_array_elements(updates) v
  loop
    select r.* into previous from app.homework_roster r where r.id=(change->>'id')::uuid;
    next_score:=(change->>'score')::numeric;
    next_feedback:=change->>'feedback';
    update app.homework_roster r set score=next_score,feedback=next_feedback,revision=r.revision+1,
      marked_at=coalesce(r.marked_at,now()),marked_by=coalesce(r.marked_by,app.actor_account())
    where r.id=previous.id returning r.revision into current_revision;
    if previous.marked_at is not null then
      insert into app.homework_grade_correction(roster_id,revision,previous_score,score,previous_feedback,feedback,actor_id,private_reason)
        values(previous.id,current_revision,previous.score,next_score,previous.feedback,next_feedback,app.actor_account(),change->>'reason');
    end if;
    return query select previous.student_id,previous.id,current_revision,'committed'::text,previous.marked_at is not null;
  end loop;
end
$$;

create function app.academic_homework_sources(student uuid,date_from date,date_to date,subject uuid)
returns table(source_id uuid,homework_id uuid,offering_id uuid,subject_id uuid,class_id uuid,year_id uuid,enrollment_id uuid,
  school_date date,due_on date,title text,score numeric,revision integer)
language sql stable security definer set search_path=pg_catalog
as $$
  select r.id,h.id,o.id,o.subject_id,c.id,c.year_id,r.enrollment_id,h.issued_on,h.due_on,h.title,r.score,r.revision
  from app.homework_roster r join app.homework h on h.id=r.homework_id join app.class_subject o on o.id=h.offering_id
    join app.school_class c on c.id=o.class_id join app.enrollment e on e.id=r.enrollment_id
  where r.student_id=student and h.issued_on between date_from and date_to and (subject is null or subject=o.subject_id)
    and app.homework_roster_available(r.joined_on,h.issued_on,e.effective_from,e.effective_until,e.voided_at,r.marked_at,app.school_today())
    and (app.has_child_link(student) or app.homework_staff_scope(h.offering_id,h.issued_on,'academics.grade'))
$$;

insert into app.audit_action_rule(action,resource_kind,change_category,allowed_capabilities) values
  ('academics.homework_scored','academics','creation',array['academics.supervise']),
  ('academics.homework_corrected','academics','correction',array['academics.supervise']);

revoke all on function app.homework_grade_rows(uuid),app.homework_grade_inbox(uuid),app.homework_grade_history(uuid,uuid),
  app.write_homework_grades(uuid,jsonb),app.academic_homework_sources(uuid,date,date,uuid)
from public,anon,authenticated,service_role;
grant execute on function app.homework_grade_rows(uuid),app.homework_grade_inbox(uuid),app.homework_grade_history(uuid,uuid),
  app.write_homework_grades(uuid,jsonb),app.academic_homework_sources(uuid,date,date,uuid) to app_runtime;
