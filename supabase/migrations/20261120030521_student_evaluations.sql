create table app.student_evaluation (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references app.student,
  offering_id uuid not null references app.class_subject,
  enrollment_id uuid not null references app.enrollment,
  period_start date not null,
  period_end date not null,
  title text not null check(char_length(btrim(title)) between 1 and 200),
  participation smallint check(participation between 1 and 5),
  understanding smallint check(understanding between 1 and 5),
  preparation smallint check(preparation between 1 and 5),
  strengths text not null default '' check(char_length(strengths)<=6000),
  improvements text not null default '' check(char_length(improvements)<=6000),
  created_by uuid not null references app.account,
  editor_id uuid not null references app.account,
  revision integer not null default 1 check(revision>=1),
  current_publication_id uuid,
  unique(student_id,offering_id,period_start,period_end),
  check(period_start<=period_end)
);
create index evaluation_offering_period_idx on app.student_evaluation(offering_id,period_end desc,id);
create index evaluation_enrollment_idx on app.student_evaluation(enrollment_id);

create table app.evaluation_publication (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references app.student_evaluation,
  prior_publication_id uuid,
  revision integer not null check(revision>=1),
  title text not null check(char_length(btrim(title)) between 1 and 200),
  participation smallint not null check(participation between 1 and 5),
  understanding smallint not null check(understanding between 1 and 5),
  preparation smallint not null check(preparation between 1 and 5),
  strengths text not null check(char_length(strengths)<=6000),
  improvements text not null check(char_length(improvements)<=6000),
  published_by uuid not null references app.account,
  published_at timestamptz not null default now(),
  private_reason text,
  unique(evaluation_id,revision),
  unique(evaluation_id,id),
  foreign key(evaluation_id,prior_publication_id) references app.evaluation_publication(evaluation_id,id),
  check((prior_publication_id is null and private_reason is null) or
    (prior_publication_id is not null and coalesce(char_length(btrim(private_reason)),0) between 1 and 500))
);
alter table app.student_evaluation add constraint evaluation_current_publication
  foreign key(id,current_publication_id) references app.evaluation_publication(evaluation_id,id);

alter table app.student_evaluation enable row level security;
alter table app.evaluation_publication enable row level security;

create function app.protect_published_evaluation_enrollment() returns trigger
language plpgsql security definer set search_path=pg_catalog
as $$
begin
  if exists(select 1 from app.student_evaluation v where v.enrollment_id=old.id and v.current_publication_id is not null
    and (new.voided_at is not null or new.effective_until<=v.period_end)) then
    raise exception 'Enrollment includes a published evaluation' using errcode='23P01';
  end if;
  return new;
end
$$;
create trigger protect_published_evaluation_enrollment after update on app.enrollment
for each row execute function app.protect_published_evaluation_enrollment();

create function app.assessment_pupil_options(target_offering uuid,scope_day date)
returns table(student_id uuid,enrollment_id uuid,student_name text,student_number text)
language sql stable security definer set search_path=pg_catalog
as $$
  select e.student_id,e.id,s.display_name,s.student_number from app.class_subject o
  join app.enrollment e on e.class_id=o.class_id and e.voided_at is null and e.effective_from<=scope_day and scope_day<e.effective_until
  join app.student s on s.id=e.student_id
  where o.id=target_offering and (app.academic_offering_scope(o.id,scope_day,'academics.grade')
    or app.academic_offering_scope(o.id,scope_day,'academics.publish'))
$$;

create function app.evaluation_staff_scope(offering uuid,scope_day date,needed text default null)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
  select case when needed is null then (
    app.academic_offering_scope(offering,scope_day,'academics.grade') or app.academic_offering_scope(offering,scope_day,'academics.publish')
  ) else needed in ('academics.grade','academics.publish') and app.academic_offering_scope(offering,scope_day,needed) end
$$;

create function app.evaluation_writable(offering uuid,begin_day date,end_day date,needed text)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
  select begin_day<=end_day and app.evaluation_staff_scope(offering,end_day,needed) and exists(
    select 1 from app.class_subject o join app.school_class c on c.id=o.class_id join app.school_year y on y.id=c.year_id
    where o.id=offering and y.state='active' and begin_day>=y.starts_on and end_day<y.ends_exclusive
  )
$$;

create function app.evaluation_projection(child uuid,target_offering uuid,school_class uuid,target uuid)
returns table(id uuid,student_id uuid,student_name text,student_number text,offering_id uuid,class_id uuid,class_code text,
  class_name_ar text,class_name_de text,year_id uuid,year_start date,year_end date,subject_id uuid,subject_name_ar text,subject_name_de text,
  period_start date,period_end date,title text,participation smallint,understanding smallint,preparation smallint,strengths text,improvements text,
  revision integer,published_id uuid,published_revision integer,published_at timestamptz,can_edit boolean,can_publish boolean,has_corrections boolean)
language sql stable security definer set search_path=pg_catalog
as $$
  select v.id,pupil.id,pupil.display_name,pupil.student_number,o.id,c.id,c.code,c.name_ar,c.name_de,y.id,y.starts_on,y.ends_exclusive,
    s.id,s.name_ar,s.name_de,v.period_start,v.period_end,
    case when child is null then v.title else p.title end,
    case when child is null then v.participation else p.participation end,
    case when child is null then v.understanding else p.understanding end,
    case when child is null then v.preparation else p.preparation end,
    case when child is null then v.strengths else p.strengths end,
    case when child is null then v.improvements else p.improvements end,
    case when child is null then v.revision else p.revision end,p.id,p.revision,p.published_at,
    child is null and app.evaluation_writable(o.id,v.period_start,v.period_end,'academics.grade'),
    child is null and app.evaluation_writable(o.id,v.period_start,v.period_end,'academics.publish'),
    child is null and p.prior_publication_id is not null
  from app.student_evaluation v join app.student pupil on pupil.id=v.student_id
    join app.class_subject o on o.id=v.offering_id join app.subject s on s.id=o.subject_id
    join app.school_class c on c.id=o.class_id join app.school_year y on y.id=c.year_id
    left join app.evaluation_publication p on p.id=v.current_publication_id
  where (target is null or v.id=target) and (target_offering is null or o.id=target_offering)
    and (school_class is null or c.id=school_class)
    and ((child is null and app.evaluation_staff_scope(o.id,v.period_end))
      or (child is not null and p.id is not null and v.student_id=child and app.academic_child_offering(child,o.id,v.period_end)))
$$;

create function app.write_evaluation_draft(
  target uuid,offering uuid,pupil uuid,begin_day date,end_day date,entry_title text,
  participation_mark integer,understanding_mark integer,preparation_mark integer,good text,improve text,expected integer
) returns table(id uuid,revision integer)
language plpgsql security definer set search_path=pg_catalog
as $$
declare draft app.student_evaluation%rowtype;
declare enrollment_ref uuid;
declare class_ref uuid;
begin
  perform app.lock_school_calendar();
  if target is not null then
    select v.* into draft from app.student_evaluation v where v.id=target for update;
    if not found or not app.evaluation_staff_scope(draft.offering_id,draft.period_end,'academics.grade') then
      raise exception 'Evaluation is unavailable' using errcode='42501';
    end if;
    if draft.revision<>expected then return; end if;
    offering:=draft.offering_id;
    pupil:=draft.student_id;
    if draft.current_publication_id is not null and (begin_day,end_day) is distinct from (draft.period_start,draft.period_end) then
      raise exception 'The period is fixed after publication' using errcode='23P01';
    end if;
  end if;
  if not app.evaluation_writable(offering,begin_day,end_day,'academics.grade') then
    raise exception 'Evaluation period is outside scope' using errcode='23P01';
  end if;
  select o.class_id into class_ref from app.class_subject o where o.id=offering;
  perform app.lock_classes(class_ref);
  select p.enrollment_id into enrollment_ref from app.assessment_pupil_options(offering,end_day) p where p.student_id=pupil;
  if not found then raise exception 'Pupil is outside the dated roster' using errcode='42501'; end if;

  if target is null then
    return query insert into app.student_evaluation as v(student_id,offering_id,enrollment_id,period_start,period_end,title,
      participation,understanding,preparation,strengths,improvements,created_by,editor_id)
      values(pupil,offering,enrollment_ref,begin_day,end_day,btrim(entry_title),
        participation_mark,understanding_mark,preparation_mark,btrim(good),btrim(improve),app.actor_account(),app.actor_account())
      returning v.id,v.revision;
  else
    return query update app.student_evaluation v set enrollment_id=enrollment_ref,period_start=begin_day,period_end=end_day,
      title=btrim(entry_title),participation=participation_mark,understanding=understanding_mark,preparation=preparation_mark,
      strengths=btrim(good),improvements=btrim(improve),editor_id=app.actor_account(),revision=v.revision+1
      where v.id=target returning v.id,v.revision;
  end if;
end
$$;

create function app.publish_evaluation(target uuid,expected integer,correction jsonb,explanation text)
returns table(publication_id uuid,revision integer,published_at timestamptz,student_id uuid,class_id uuid,school_date date,change_kind text)
language plpgsql security definer set search_path=pg_catalog
as $$
declare draft record;
declare before app.evaluation_publication%rowtype;
declare saved app.evaluation_publication%rowtype;
declare class_ref uuid;
declare next_revision integer;
begin
  perform app.lock_school_calendar();
  select v.* into draft from app.student_evaluation v where v.id=target for update;
  if not found or not app.evaluation_writable(draft.offering_id,draft.period_start,draft.period_end,'academics.publish') then
    raise exception 'Evaluation cannot be published' using errcode='42501';
  end if;
  if draft.revision<>expected then return; end if;
  select o.class_id into class_ref from app.class_subject o where o.id=draft.offering_id;
  perform app.lock_classes(class_ref);
  if not exists(select 1 from app.assessment_pupil_options(draft.offering_id,draft.period_end) p
    where p.student_id=draft.student_id and p.enrollment_id=draft.enrollment_id) then
    raise exception 'Evaluation enrollment changed' using errcode='23P01';
  end if;
  next_revision:=draft.revision;
  if correction is null then
    if draft.current_publication_id is not null then raise exception 'Evaluation is already published' using errcode='23P01'; end if;
  else
    if draft.current_publication_id is null or coalesce(char_length(btrim(explanation)),0) not between 1 and 500 then
      raise exception 'Correction requires a prior publication and reason' using errcode='23514';
    end if;
    select p.* into before from app.evaluation_publication p where p.id=draft.current_publication_id;
    draft.title:=btrim(correction->>'title');
    draft.participation:=(correction->>'participation')::smallint;
    draft.understanding:=(correction->>'understanding')::smallint;
    draft.preparation:=(correction->>'preparation')::smallint;
    draft.strengths:=btrim(correction->>'strengths');
    draft.improvements:=btrim(correction->>'improvements');
    if (draft.title,draft.participation,draft.understanding,draft.preparation,draft.strengths,draft.improvements)
      is not distinct from (before.title,before.participation,before.understanding,before.preparation,before.strengths,before.improvements) then
      raise exception 'Correction has no change' using errcode='23514';
    end if;
    next_revision:=draft.revision+1;
  end if;
  if draft.participation is null or draft.understanding is null or draft.preparation is null then
    raise exception 'All evaluation dimensions must be filled' using errcode='23514';
  end if;

  insert into app.evaluation_publication(evaluation_id,prior_publication_id,revision,title,participation,understanding,
    preparation,strengths,improvements,published_by,private_reason)
    values(target,draft.current_publication_id,next_revision,draft.title,draft.participation,draft.understanding,
      draft.preparation,draft.strengths,draft.improvements,app.actor_account(),btrim(explanation))
    returning * into saved;
  update app.student_evaluation v set current_publication_id=saved.id,revision=next_revision,title=draft.title,
    participation=draft.participation,understanding=draft.understanding,preparation=draft.preparation,
    strengths=draft.strengths,improvements=draft.improvements,editor_id=app.actor_account()
    where v.id=target;
  return query select saved.id,saved.revision,saved.published_at,draft.student_id,class_ref,draft.period_end,
    case when correction is null then 'initial' else 'correction' end;
end
$$;

create function app.evaluation_publication_history(target uuid)
returns table(id uuid,revision integer,title text,participation smallint,understanding smallint,preparation smallint,
  strengths text,improvements text,actor_name text,published_at timestamptz,reason text)
language sql stable security definer set search_path=pg_catalog
as $$
  select p.id,p.revision,p.title,p.participation,p.understanding,p.preparation,p.strengths,p.improvements,who.display_name,
    p.published_at,p.private_reason from app.evaluation_publication p join app.student_evaluation v on v.id=p.evaluation_id
    left join app.staff_profile who on who.account_id=p.published_by
  where v.id=target and app.evaluation_staff_scope(v.offering_id,v.period_end)
$$;

create function app.academic_evaluation_sources(student uuid,date_from date,date_to date,subject uuid)
returns table(source_id uuid,evaluation_id uuid,offering_id uuid,subject_id uuid,class_id uuid,year_id uuid,enrollment_id uuid,
  period_start date,period_end date,title text,participation smallint,understanding smallint,preparation smallint,revision integer)
language sql stable security definer set search_path=pg_catalog
as $$
  select p.id,v.id,o.id,o.subject_id,c.id,c.year_id,v.enrollment_id,v.period_start,v.period_end,p.title,p.participation,
    p.understanding,p.preparation,p.revision
  from app.student_evaluation v join app.evaluation_publication p on p.id=v.current_publication_id
    join app.class_subject o on o.id=v.offering_id join app.school_class c on c.id=o.class_id
  where v.student_id=student and v.period_end between date_from and date_to and (subject is null or o.subject_id=subject)
    and (app.evaluation_staff_scope(o.id,v.period_end) or app.academic_child_offering(student,o.id,v.period_end))
$$;

insert into app.audit_action_rule(action,resource_kind,change_category,allowed_capabilities) values
  ('academics.evaluation_created','academics','creation',array['academics.supervise']),
  ('academics.evaluation_updated','academics','update',array['academics.supervise']),
  ('academics.evaluation_published','academics','publication',array['academics.supervise']),
  ('academics.evaluation_corrected','academics','correction',array['academics.supervise']);

revoke all on function app.protect_published_evaluation_enrollment(),app.assessment_pupil_options(uuid,date),
  app.evaluation_staff_scope(uuid,date,text),app.evaluation_writable(uuid,date,date,text),app.evaluation_projection(uuid,uuid,uuid,uuid),
  app.write_evaluation_draft(uuid,uuid,uuid,date,date,text,integer,integer,integer,text,text,integer),
  app.publish_evaluation(uuid,integer,jsonb,text),app.evaluation_publication_history(uuid),app.academic_evaluation_sources(uuid,date,date,uuid)
from public,anon,authenticated,service_role;
grant execute on function app.assessment_pupil_options(uuid,date),app.evaluation_staff_scope(uuid,date,text),
  app.evaluation_projection(uuid,uuid,uuid,uuid),app.write_evaluation_draft(uuid,uuid,uuid,date,date,text,integer,integer,integer,text,text,integer),
  app.publish_evaluation(uuid,integer,jsonb,text),app.evaluation_publication_history(uuid),app.academic_evaluation_sources(uuid,date,date,uuid)
to app_runtime;
