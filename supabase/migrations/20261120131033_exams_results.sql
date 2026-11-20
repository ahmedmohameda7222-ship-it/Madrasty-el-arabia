create function app.exam_score_valid(value numeric,maximum numeric)
returns boolean language sql immutable set search_path=pg_catalog
as $$
  select value is null or (value>=0 and value<=maximum and scale(value)<=4)
$$;

create table app.exam (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references app.class_subject,
  exam_date date not null,
  exam_time time(0),
  exam_kind text not null check(exam_kind in ('oral','written')),
  title text not null check(char_length(btrim(title)) between 1 and 200),
  max_score numeric not null check(max_score>0 and max_score<=1000000 and scale(max_score)<=4),
  created_by uuid not null references app.account,
  revision integer not null default 1 check(revision>=1),
  announced_id uuid,
  check(exam_time is null or (exam_time<time '24:00' and extract(second from exam_time)=0))
);
create index exam_offering_date_idx on app.exam(offering_id,exam_date desc,id);

create table app.exam_announcement (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references app.exam,
  prior_announcement_id uuid,
  revision integer not null check(revision>=1),
  exam_date date not null,
  exam_time time(0),
  exam_kind text not null check(exam_kind in ('oral','written')),
  title text not null,
  max_score numeric not null,
  actor_id uuid not null references app.account,
  occurred_at timestamptz not null default now(),
  unique(exam_id,revision),
  unique(exam_id,id),
  foreign key(exam_id,prior_announcement_id) references app.exam_announcement(exam_id,id)
);
alter table app.exam add constraint exam_current_announcement foreign key(id,announced_id)
  references app.exam_announcement(exam_id,id);

create table app.exam_result (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references app.exam,
  student_id uuid not null references app.student,
  enrollment_id uuid not null references app.enrollment,
  exam_date date not null,
  score numeric check(app.exam_score_valid(score,1000000)),
  feedback text check(char_length(feedback)<=3000),
  recorded_by uuid not null references app.account,
  revision integer not null default 2 check(revision>=2),
  published_id uuid,
  unique(exam_id,student_id)
);
create index exam_result_pupil_idx on app.exam_result(student_id,exam_id);
create index exam_result_enrollment_idx on app.exam_result(enrollment_id);

create table app.exam_result_batch (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references app.exam,
  exam_revision integer not null check(exam_revision>=1),
  actor_id uuid not null references app.account,
  published_at timestamptz not null default now(),
  unique(exam_id,id)
);

create table app.exam_result_publication (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null references app.exam_result,
  batch_id uuid not null references app.exam_result_batch,
  previous_publication_id uuid,
  revision integer not null check(revision>=2),
  score numeric not null,
  max_score numeric not null check(max_score>0 and max_score<=1000000 and scale(max_score)<=4),
  feedback text check(char_length(feedback)<=3000),
  enrollment_id uuid not null references app.enrollment,
  exam_date date not null,
  title text not null,
  exam_kind text not null check(exam_kind in ('oral','written')),
  private_reason text,
  unique(result_id,revision),
  unique(result_id,id),
  foreign key(result_id,previous_publication_id) references app.exam_result_publication(result_id,id),
  check(app.exam_score_valid(score,max_score)),
  check((previous_publication_id is null and private_reason is null) or
    (previous_publication_id is not null and coalesce(char_length(btrim(private_reason)),0) between 1 and 500))
);
alter table app.exam_result add constraint exam_current_result_publication foreign key(id,published_id)
  references app.exam_result_publication(result_id,id);

alter table app.exam enable row level security;
alter table app.exam_announcement enable row level security;
alter table app.exam_result enable row level security;
alter table app.exam_result_batch enable row level security;
alter table app.exam_result_publication enable row level security;

create function app.protect_published_exam_enrollment() returns trigger
language plpgsql security definer set search_path=pg_catalog
as $$
begin
  if exists(select 1 from app.exam_result r where r.enrollment_id=old.id and r.published_id is not null
    and (new.voided_at is not null or new.effective_until<=r.exam_date)) then
    raise exception 'Enrollment includes a published exam result' using errcode='23P01';
  end if;
  return new;
end
$$;
create trigger protect_published_exam_enrollment after update on app.enrollment
for each row execute function app.protect_published_exam_enrollment();

create function app.exam_scope(offering uuid,exam_day date,needed text default null)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
  select case when needed is null then (
    app.academic_offering_scope(offering,exam_day,'academics.plan') or
    app.academic_offering_scope(offering,exam_day,'academics.grade') or
    app.academic_offering_scope(offering,exam_day,'academics.publish')
  ) else needed in ('academics.plan','academics.grade','academics.publish') and app.academic_offering_scope(offering,exam_day,needed) end
$$;

create function app.exam_writable(offering uuid,exam_day date,needed text)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
  select app.exam_scope(offering,exam_day,needed) and exists(
    select 1 from app.class_subject o join app.school_class c on c.id=o.class_id join app.school_year y on y.id=c.year_id
    where o.id=offering and y.state='active' and app.is_teaching_day(c.id,exam_day)
  )
$$;

create function app.exam_projection(child uuid,target_offering uuid,school_class uuid,target uuid)
returns table(id uuid,offering_id uuid,class_id uuid,class_code text,class_name_ar text,class_name_de text,
  year_id uuid,year_start date,year_end date,subject_id uuid,subject_name_ar text,subject_name_de text,
  exam_date date,exam_time time,exam_kind text,title text,max_score numeric,revision integer,
  announcement_id uuid,announcement_revision integer,announced_date date,announced_time time,announced_at timestamptz,announcement_pending boolean,
  result_id uuid,result_revision integer,result_exam_date date,result_score numeric,result_max_score numeric,
  result_feedback text,result_published_at timestamptz,can_edit boolean,can_announce boolean,can_review boolean,can_mark boolean,can_publish boolean)
language sql stable security definer set search_path=pg_catalog
as $$
  select e.id,o.id,c.id,c.code,c.name_ar,c.name_de,y.id,y.starts_on,y.ends_exclusive,s.id,s.name_ar,s.name_de,
    case when child is null then e.exam_date else a.exam_date end,
    case when child is null then e.exam_time else a.exam_time end,
    case when child is null then e.exam_kind else a.exam_kind end,
    case when child is null then e.title else a.title end,
    case when child is null then e.max_score else a.max_score end,
    case when child is null then e.revision else a.revision end,
    a.id,a.revision,a.exam_date,a.exam_time,a.occurred_at,
    child is null and a.id is not null and (e.exam_date,e.exam_time,e.exam_kind,e.title,e.max_score)
      is distinct from (a.exam_date,a.exam_time,a.exam_kind,a.title,a.max_score),
    p.id,p.revision,p.exam_date,p.score,p.max_score,p.feedback,b.published_at,
    child is null and app.exam_writable(o.id,e.exam_date,'academics.plan'),
    child is null and app.exam_writable(o.id,e.exam_date,'academics.publish'),
    child is null and app.evaluation_staff_scope(o.id,coalesce(a.exam_date,e.exam_date)),
    child is null and app.exam_writable(o.id,coalesce(a.exam_date,e.exam_date),'academics.grade'),
    child is null and a.id is not null and app.exam_writable(o.id,a.exam_date,'academics.publish')
  from app.exam e join app.class_subject o on o.id=e.offering_id join app.subject s on s.id=o.subject_id
  join app.school_class c on c.id=o.class_id join app.school_year y on y.id=c.year_id
  left join app.exam_announcement a on a.id=e.announced_id
  left join app.exam_result r on r.exam_id=e.id and r.student_id=child
  left join app.exam_result_publication p on p.id=r.published_id
  left join app.exam_result_batch b on b.id=p.batch_id
  where (target is null or e.id=target) and (target_offering is null or e.offering_id=target_offering)
    and (school_class is null or o.class_id=school_class)
    and ((child is null and (app.exam_scope(o.id,e.exam_date) or app.exam_scope(o.id,a.exam_date)))
      or (child is not null and a.id is not null and (app.academic_child_offering(child,o.id,a.exam_date)
        or (p.id is not null and app.academic_child_offering(child,o.id,p.exam_date)))))
$$;

create function app.write_exam(target uuid,offering uuid,exam_day date,exam_clock time,exam_method text,exam_title text,
  maximum numeric,expected integer)
returns table(id uuid,revision integer)
language plpgsql security definer set search_path=pg_catalog
as $$
declare row_before app.exam%rowtype;
begin
  perform app.lock_school_calendar();
  if target is not null then
    select e.* into row_before from app.exam e where e.id=target for update;
    if not found or not app.exam_scope(row_before.offering_id,row_before.exam_date,'academics.plan') then
      raise exception 'Exam is outside planning scope' using errcode='42501';
    end if;
    if row_before.revision<>expected then return; end if;
    offering:=row_before.offering_id;
  end if;
  if not app.exam_writable(offering,exam_day,'academics.plan') then
    raise exception 'Exam date is outside scope or closed' using errcode='23P01';
  end if;
  if target is not null and exists(select 1 from app.exam_result r left join app.exam_result_publication p on p.id=r.published_id
    where r.exam_id=target and (r.score>maximum or p.score>maximum)) then
    raise exception 'Maximum is below a recorded score' using errcode='23514';
  end if;
  if target is null then
    return query insert into app.exam as e(offering_id,exam_date,exam_time,exam_kind,title,max_score,created_by)
      values(offering,exam_day,exam_clock,exam_method,btrim(exam_title),maximum,app.actor_account()) returning e.id,e.revision;
  else
    return query update app.exam e set exam_date=exam_day,exam_time=exam_clock,exam_kind=exam_method,
      title=btrim(exam_title),max_score=maximum,revision=e.revision+1
      where e.id=target returning e.id,e.revision;
  end if;
end
$$;

create function app.announce_exam(target uuid,expected integer,exam_day date,exam_clock time,use_draft_clock boolean)
returns table(announcement_id uuid,prior_announcement_id uuid,revision integer,exam_date date,exam_time time,
  class_id uuid,offering_id uuid,change_kind text,announced_at timestamptz)
language plpgsql security definer set search_path=pg_catalog
as $$
declare draft app.exam%rowtype;
declare old_notice app.exam_announcement%rowtype;
declare saved app.exam_announcement%rowtype;
declare class_ref uuid;
begin
  perform app.lock_school_calendar();
  select e.* into draft from app.exam e where e.id=target for update;
  if not found or not(app.exam_scope(draft.offering_id,draft.exam_date,'academics.publish')
    and app.exam_writable(draft.offering_id,exam_day,'academics.publish')) then
    raise exception 'Exam announcement is outside scope' using errcode='42501';
  end if;
  if draft.revision<>expected then return; end if;
  if use_draft_clock then exam_clock:=draft.exam_time; end if;
  select o.class_id into class_ref from app.class_subject o where o.id=draft.offering_id;
  perform app.lock_classes(class_ref);
  if draft.announced_id is not null then
    select a.* into old_notice from app.exam_announcement a where a.id=draft.announced_id;
    if (old_notice.exam_date,old_notice.exam_time,old_notice.exam_kind,old_notice.title,old_notice.max_score)
      is not distinct from (exam_day,exam_clock,draft.exam_kind,draft.title,draft.max_score) then
      raise exception 'Exam announcement has no change' using errcode='23514';
    end if;
  end if;
  insert into app.exam_announcement(exam_id,prior_announcement_id,revision,exam_date,exam_time,exam_kind,title,max_score,actor_id)
    values(target,draft.announced_id,draft.revision+1,exam_day,exam_clock,draft.exam_kind,draft.title,draft.max_score,app.actor_account())
    returning * into saved;
  update app.exam e set announced_id=saved.id,exam_date=exam_day,exam_time=exam_clock,revision=saved.revision where e.id=target;
  return query select saved.id,saved.prior_announcement_id,saved.revision,saved.exam_date,saved.exam_time,class_ref,draft.offering_id,
    case when saved.prior_announcement_id is null then 'initial' else 'reschedule' end,saved.occurred_at;
end
$$;

create function app.exam_mark_roster(target uuid)
returns table(student_id uuid,student_name text,student_number text,enrollment_id uuid,result_id uuid,revision integer,score numeric,
  feedback text,published_id uuid,published_revision integer,published_score numeric,published_max_score numeric,
  can_mark boolean,can_correct boolean,eligible boolean,ready_to_publish boolean)
language sql stable security definer set search_path=pg_catalog
as $$
  with exam_context as (
    select e.id,e.offering_id,coalesce(a.exam_date,e.exam_date) as active_date
    from app.exam e left join app.exam_announcement a on a.id=e.announced_id
    where e.id=target and app.evaluation_staff_scope(e.offering_id,coalesce(a.exam_date,e.exam_date))
  ), candidates as (
    select e.id as exam_id,p.student_id,p.enrollment_id,true as current_cohort
    from exam_context e cross join lateral app.assessment_pupil_options(e.offering_id,e.active_date) p
    union all
    select e.id,r.student_id,r.enrollment_id,false from exam_context e join app.exam_result r on r.exam_id=e.id
    where r.published_id is not null and app.evaluation_staff_scope(e.offering_id,r.exam_date)
      and not exists(select 1 from app.assessment_pupil_options(e.offering_id,e.active_date) p where p.student_id=r.student_id)
  )
  select pupil.id,pupil.display_name,pupil.student_number,c.enrollment_id,r.id,coalesce(r.revision,1),r.score,r.feedback,p.id,
    p.revision,p.score,p.max_score,
    c.current_cohort and p.id is null and app.exam_writable(e.offering_id,e.active_date,'academics.grade'),
    p.id is not null and app.exam_writable(e.offering_id,r.exam_date,'academics.publish'),c.current_cohort,
    c.current_cohort and r.score is not null and p.id is null and r.exam_date=e.active_date and r.enrollment_id=c.enrollment_id
  from candidates c join exam_context e on e.id=c.exam_id join app.student pupil on pupil.id=c.student_id
  left join app.exam_result r on r.exam_id=c.exam_id and r.student_id=pupil.id
  left join app.exam_result_publication p on p.id=r.published_id
$$;

create function app.write_exam_mark(target uuid,pupil uuid,expected integer,proposed numeric,remarks text)
returns table(result_id uuid,revision integer)
language plpgsql security definer set search_path=pg_catalog
as $$
declare exam_row app.exam%rowtype;
declare active_date date;
declare class_ref uuid;
declare enrollment_ref uuid;
declare before app.exam_result%rowtype;
begin
  perform app.lock_school_calendar();
  select e.* into exam_row from app.exam e where e.id=target for update;
  if not found then raise exception 'Exam is unavailable' using errcode='42501'; end if;
  select coalesce(a.exam_date,exam_row.exam_date) into active_date from app.exam e
    left join app.exam_announcement a on a.id=e.announced_id where e.id=target;
  if not app.exam_writable(exam_row.offering_id,active_date,'academics.grade') then
    raise exception 'Exam is outside grading scope' using errcode='42501';
  end if;
  select o.class_id into class_ref from app.class_subject o where o.id=exam_row.offering_id;
  perform app.lock_classes(class_ref);
  select p.enrollment_id into enrollment_ref from app.assessment_pupil_options(exam_row.offering_id,active_date) p where p.student_id=pupil;
  if not found then raise exception 'Pupil is outside the exam roster' using errcode='42501'; end if;
  select r.* into before from app.exam_result r where r.exam_id=target and r.student_id=pupil for update;
  if coalesce(before.revision,1)<>expected then return; end if;
  if before.published_id is not null then raise exception 'Use reviewed correction for published results' using errcode='23P01'; end if;
  if not app.exam_score_valid(proposed,exam_row.max_score) then raise exception 'Exam mark exceeds bounds' using errcode='23514'; end if;
  if before.id is null then
    return query insert into app.exam_result as r(exam_id,student_id,enrollment_id,exam_date,score,feedback,recorded_by)
      values(target,pupil,enrollment_ref,active_date,proposed,nullif(btrim(remarks),''),app.actor_account()) returning r.id,r.revision;
  else
    return query update app.exam_result r set score=proposed,feedback=nullif(btrim(remarks),''),
      enrollment_id=enrollment_ref,exam_date=active_date,recorded_by=app.actor_account(),revision=r.revision+1
      where r.id=before.id returning r.id,r.revision;
  end if;
end
$$;

create function app.publish_exam_results(target uuid,expected integer,reviewed jsonb)
returns table(batch_id uuid,result_id uuid,publication_id uuid,student_id uuid,class_id uuid,exam_date date,revision integer)
language plpgsql security definer set search_path=pg_catalog
as $$
declare exam_row app.exam%rowtype;
declare notice app.exam_announcement%rowtype;
declare batch app.exam_result_batch%rowtype;
declare before app.exam_result%rowtype;
declare saved app.exam_result_publication%rowtype;
declare class_ref uuid;
declare row_ids uuid[];
declare record_ref uuid;
begin
  perform app.lock_school_calendar();
  select e.* into exam_row from app.exam e where e.id=target for update;
  if not found or exam_row.announced_id is null then
    raise exception 'An announced exam is required' using errcode='23P01';
  end if;
  select a.* into notice from app.exam_announcement a where a.id=exam_row.announced_id;
  if not app.exam_writable(exam_row.offering_id,notice.exam_date,'academics.publish') then
    raise exception 'Exam results are outside publishing scope' using errcode='42501';
  end if;
  if exam_row.revision<>expected then return; end if;
  select o.class_id into class_ref from app.class_subject o where o.id=exam_row.offering_id;
  perform app.lock_classes(class_ref);
  if jsonb_typeof(reviewed) is distinct from 'array' then
    raise exception 'Result publication requires reviewed rows' using errcode='23514';
  end if;
  if jsonb_array_length(reviewed) not between 1 and 1000
    or jsonb_array_length(reviewed)<>(select count(distinct v->>'studentId') from jsonb_array_elements(reviewed) v)
  then raise exception 'Result publication requires distinct reviewed rows' using errcode='23514'; end if;

  select array_agg(r.id order by r.id) into row_ids
  from jsonb_to_recordset(reviewed) as checked("studentId" uuid,revision integer)
  join app.exam_result r on r.exam_id=target and r.student_id=checked."studentId" and r.revision=checked.revision
  join app.assessment_pupil_options(exam_row.offering_id,notice.exam_date) p
    on p.student_id=r.student_id and p.enrollment_id=r.enrollment_id
  where r.score is not null and r.published_id is null and r.exam_date=notice.exam_date and app.exam_score_valid(r.score,exam_row.max_score);
  if coalesce(cardinality(row_ids),0)<>jsonb_array_length(reviewed) then return; end if;

  insert into app.exam_result_batch(exam_id,exam_revision,actor_id)
    values(target,exam_row.revision,app.actor_account()) returning * into batch;
  foreach record_ref in array row_ids
  loop
    select r.* into before from app.exam_result r where r.id=record_ref for update;
    insert into app.exam_result_publication(result_id,batch_id,revision,score,max_score,feedback,enrollment_id,exam_date,title,exam_kind)
      values(before.id,batch.id,before.revision+1,before.score,exam_row.max_score,before.feedback,
        before.enrollment_id,before.exam_date,notice.title,notice.exam_kind) returning * into saved;
    update app.exam_result r set published_id=saved.id,revision=saved.revision where r.id=before.id;
    return query select batch.id,before.id,saved.id,before.student_id,class_ref,saved.exam_date,saved.revision;
  end loop;
end
$$;

create function app.correct_exam_result(target uuid,pupil uuid,expected integer,proposed numeric,remarks text,explanation text,expected_exam integer)
returns table(batch_id uuid,result_id uuid,publication_id uuid,student_id uuid,class_id uuid,exam_date date,revision integer)
language plpgsql security definer set search_path=pg_catalog
as $$
declare exam_row app.exam%rowtype;
declare before app.exam_result%rowtype;
declare previous app.exam_result_publication%rowtype;
declare saved app.exam_result_publication%rowtype;
declare batch app.exam_result_batch%rowtype;
declare class_ref uuid;
declare publication_max numeric;
begin
  perform app.lock_school_calendar();
  select e.* into exam_row from app.exam e where e.id=target for update;
  if not found then raise exception 'Exam is unavailable' using errcode='42501'; end if;
  select r.* into before from app.exam_result r where r.exam_id=target and r.student_id=pupil for update;
  if not found or before.published_id is null or not app.exam_writable(exam_row.offering_id,before.exam_date,'academics.publish') then
    raise exception 'Exam result correction is outside scope' using errcode='42501';
  end if;
  if before.revision<>expected or (expected_exam is not null and exam_row.revision<>expected_exam) then return; end if;
  select o.class_id into class_ref from app.class_subject o where o.id=exam_row.offering_id;
  perform app.lock_classes(class_ref);
  if not exists(select 1 from app.assessment_pupil_options(exam_row.offering_id,before.exam_date) p
    where p.student_id=pupil and p.enrollment_id=before.enrollment_id) then
    raise exception 'Exam enrollment changed' using errcode='23P01';
  end if;
  select p.* into previous from app.exam_result_publication p where p.id=before.published_id;
  publication_max:=case when expected_exam is null then previous.max_score else exam_row.max_score end;
  if proposed is null or not app.exam_score_valid(proposed,least(publication_max,exam_row.max_score))
    or coalesce(char_length(btrim(explanation)),0) not between 1 and 500 then
    raise exception 'A valid score and reason are required' using errcode='23514';
  end if;
  remarks:=nullif(btrim(remarks),'');
  if (proposed,remarks,publication_max) is not distinct from (previous.score,previous.feedback,previous.max_score) then
    raise exception 'Exam correction has no change' using errcode='23514';
  end if;

  insert into app.exam_result_batch(exam_id,exam_revision,actor_id)
    values(target,exam_row.revision,app.actor_account()) returning * into batch;
  insert into app.exam_result_publication(result_id,batch_id,previous_publication_id,revision,score,max_score,feedback,enrollment_id,
    exam_date,title,exam_kind,private_reason)
    values(before.id,batch.id,previous.id,before.revision+1,proposed,publication_max,remarks,before.enrollment_id,
      before.exam_date,previous.title,previous.exam_kind,btrim(explanation)) returning * into saved;
  update app.exam_result r set score=proposed,feedback=remarks,recorded_by=app.actor_account(),published_id=saved.id,revision=saved.revision
    where r.id=before.id;
  return query select batch.id,before.id,saved.id,before.student_id,class_ref,saved.exam_date,saved.revision;
end
$$;

create function app.exam_result_history(target uuid,pupil uuid)
returns table(publication_id uuid,revision integer,score numeric,max_score numeric,feedback text,exam_date date,
  occurred_at timestamptz,actor_name text,reason text)
language sql stable security definer set search_path=pg_catalog
as $$
  select p.id,p.revision,p.score,p.max_score,p.feedback,p.exam_date,b.published_at,person.display_name,p.private_reason
  from app.exam_result r join app.exam e on e.id=r.exam_id join app.exam_result_publication p on p.result_id=r.id
  join app.exam_result_batch b on b.id=p.batch_id left join app.staff_profile person on person.account_id=b.actor_id
  where r.exam_id=target and r.student_id=pupil and app.evaluation_staff_scope(e.offering_id,r.exam_date)
$$;

create function app.academic_exam_sources(student uuid,date_from date,date_to date,subject uuid)
returns table(source_id uuid,exam_id uuid,offering_id uuid,subject_id uuid,class_id uuid,year_id uuid,enrollment_id uuid,
  exam_date date,exam_kind text,title text,score numeric,max_score numeric,revision integer)
language sql stable security definer set search_path=pg_catalog
as $$
  select p.id,e.id,o.id,o.subject_id,c.id,c.year_id,p.enrollment_id,p.exam_date,p.exam_kind,p.title,p.score,p.max_score,p.revision
  from app.exam_result r join app.exam_result_publication p on p.id=r.published_id join app.exam e on e.id=r.exam_id
  join app.class_subject o on o.id=e.offering_id join app.school_class c on c.id=o.class_id
  where r.student_id=student and p.exam_date between date_from and date_to and (subject is null or o.subject_id=subject)
    and (app.evaluation_staff_scope(o.id,p.exam_date) or app.academic_child_offering(student,o.id,p.exam_date))
$$;

insert into app.audit_action_rule(action,resource_kind,change_category,allowed_capabilities) values
  ('academics.exam_created','academics','creation',array['academics.supervise']),
  ('academics.exam_updated','academics','update',array['academics.supervise']),
  ('academics.exam_announced','academics','publication',array['academics.supervise']),
  ('academics.exam_rescheduled','academics','publication',array['academics.supervise']),
  ('academics.exam_marked','academics','update',array['academics.supervise']),
  ('academics.exam_results_published','academics','publication',array['academics.supervise']),
  ('academics.exam_result_corrected','academics','correction',array['academics.supervise']);

revoke all on function app.exam_score_valid(numeric,numeric),app.protect_published_exam_enrollment(),app.exam_scope(uuid,date,text),
  app.exam_writable(uuid,date,text),app.exam_projection(uuid,uuid,uuid,uuid),app.write_exam(uuid,uuid,date,time,text,text,numeric,integer),
  app.announce_exam(uuid,integer,date,time,boolean),app.exam_mark_roster(uuid),app.write_exam_mark(uuid,uuid,integer,numeric,text),
  app.publish_exam_results(uuid,integer,jsonb),app.correct_exam_result(uuid,uuid,integer,numeric,text,text,integer),
  app.exam_result_history(uuid,uuid),app.academic_exam_sources(uuid,date,date,uuid) from public,anon,authenticated,service_role;
grant execute on function app.exam_scope(uuid,date,text),app.exam_projection(uuid,uuid,uuid,uuid),
  app.write_exam(uuid,uuid,date,time,text,text,numeric,integer),app.announce_exam(uuid,integer,date,time,boolean),
  app.exam_mark_roster(uuid),app.write_exam_mark(uuid,uuid,integer,numeric,text),app.publish_exam_results(uuid,integer,jsonb),
  app.correct_exam_result(uuid,uuid,integer,numeric,text,text,integer),app.exam_result_history(uuid,uuid),
  app.academic_exam_sources(uuid,date,date,uuid) to app_runtime;
