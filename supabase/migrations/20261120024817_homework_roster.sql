create table app.homework (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references app.class_subject,
  lesson_id uuid references app.curriculum_lesson,
  title text not null check(char_length(btrim(title)) between 1 and 200),
  instructions text not null check(char_length(btrim(instructions)) between 1 and 12000),
  issued_on date not null,
  due_on date not null,
  author_id uuid not null references app.account,
  authored_at timestamptz not null default now(),
  revision integer not null default 1 check(revision>=1),
  check(issued_on<=due_on)
);
create index homework_offering_issue_idx on app.homework(offering_id,issued_on desc,id);

create table app.homework_roster (
  id uuid primary key default gen_random_uuid(),
  homework_id uuid not null references app.homework,
  student_id uuid not null references app.student,
  enrollment_id uuid not null references app.enrollment,
  joined_on date not null,
  added_later boolean not null,
  score numeric check(score>=0 and score<=20 and score*2=trunc(score*2)),
  feedback text check(char_length(feedback)<=3000),
  marked_at timestamptz,
  marked_by uuid references app.account,
  revision integer not null default 1 check(revision>=1),
  unique(homework_id,student_id),
  check((marked_at is null)=(marked_by is null)),
  check(marked_at is not null or (score is null and feedback is null))
);
create index homework_student_idx on app.homework_roster(student_id,homework_id);
create index homework_enrollment_idx on app.homework_roster(enrollment_id);

alter table app.homework enable row level security;
alter table app.homework_roster enable row level security;

create function app.sync_homework_roster(target uuid,pupil uuid default null)
returns void language sql security definer set search_path=pg_catalog
as $$
  insert into app.homework_roster as r(homework_id,student_id,enrollment_id,joined_on,added_later)
  select distinct on (e.student_id) h.id,e.student_id,e.id,e.effective_from,e.effective_from>h.issued_on
  from app.homework h join app.class_subject o on o.id=h.offering_id
    join app.enrollment e on e.class_id=o.class_id and e.voided_at is null and e.effective_until>h.issued_on
  where h.id=target and (pupil is null or e.student_id=pupil)
  order by e.student_id,e.effective_from,e.id
  on conflict(homework_id,student_id) do update set
    enrollment_id=excluded.enrollment_id,joined_on=excluded.joined_on,added_later=excluded.added_later,revision=r.revision+1
  where r.marked_at is null and (r.enrollment_id,r.joined_on,r.added_later)
    is distinct from (excluded.enrollment_id,excluded.joined_on,excluded.added_later)
$$;

create function app.homework_on_enrollment() returns trigger
language plpgsql security definer set search_path=pg_catalog
as $$
declare assignment uuid;
begin
  if tg_op='UPDATE' and exists(
    select 1 from app.homework_roster r join app.homework h on h.id=r.homework_id
    where r.enrollment_id=old.id and r.marked_at is not null and
      (new.voided_at is not null or new.effective_until<=greatest(h.issued_on,r.joined_on))
  ) then raise exception 'Enrollment includes a recorded homework result' using errcode='23P01'; end if;

  for assignment in
    select h.id from app.homework h join app.class_subject o on o.id=h.offering_id
    where o.class_id=new.class_id order by h.id
  loop
    perform app.sync_homework_roster(assignment,new.student_id);
  end loop;
  return new;
end
$$;
create trigger homework_on_enrollment after insert or update on app.enrollment
for each row execute function app.homework_on_enrollment();

select app.sync_homework_roster(h.id) from app.homework h;

create function app.homework_roster_available(row_joined date,assigned date,enrollment_start date,enrollment_end date,
  voided timestamptz,marked timestamptz,snapshot_day date)
returns boolean language sql immutable set search_path=pg_catalog
as $$
  select greatest(row_joined,assigned)<=snapshot_day
    and (marked is not null or (voided is null and enrollment_start<=greatest(row_joined,assigned)
      and greatest(row_joined,assigned)<enrollment_end))
$$;

create function app.homework_staff_scope(target uuid,issue_day date,operation text default null)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
  select case when operation is null then (
    app.academic_offering_scope(target,issue_day,'academics.plan') or app.academic_offering_scope(target,issue_day,'academics.grade')
  ) else operation in ('academics.plan','academics.grade') and app.academic_offering_scope(target,issue_day,operation) end
$$;

create function app.homework_writable(target uuid,issue_day date,due_day date)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
  select issue_day<=due_day and app.homework_staff_scope(target,issue_day,'academics.plan') and exists(
    select 1 from app.class_subject o join app.school_class c on c.id=o.class_id
      join app.school_year y on y.id=c.year_id
    where o.id=target and y.state='active' and due_day<y.ends_exclusive and app.is_teaching_day(c.id,issue_day)
  )
$$;

create function app.homework_projection(child uuid,school_class uuid,target_offering uuid,target uuid)
returns table(id uuid,offering_id uuid,class_id uuid,class_code text,class_name_ar text,class_name_de text,year_id uuid,
  year_start date,year_end date,subject_id uuid,subject_name_ar text,subject_name_de text,lesson_id uuid,
  title text,instructions text,issued_on date,due_on date,revision integer,roster_count integer,can_edit boolean,can_grade boolean,
  joined_on date,added_later boolean,score numeric,feedback text)
language sql stable security definer set search_path=pg_catalog
as $$
  select h.id,h.offering_id,c.id,c.code,c.name_ar,c.name_de,y.id,y.starts_on,y.ends_exclusive,
    s.id,s.name_ar,s.name_de,case when child is null or l.published_id is not null then h.lesson_id end,
    h.title,h.instructions,h.issued_on,h.due_on,h.revision,
    case when child is null then (select count(*)::int from app.homework_roster p join app.enrollment enrolled on enrolled.id=p.enrollment_id
      where p.homework_id=h.id and app.homework_roster_available(p.joined_on,h.issued_on,enrolled.effective_from,
        enrolled.effective_until,enrolled.voided_at,p.marked_at,app.school_today())) end,
    child is null and app.homework_writable(h.offering_id,h.issued_on,h.due_on),
    child is null and app.homework_staff_scope(h.offering_id,h.issued_on,'academics.grade') and y.state='active' and h.issued_on<=app.school_today(),
    r.joined_on,r.added_later,r.score,r.feedback
  from app.homework h join app.class_subject o on o.id=h.offering_id
  join app.school_class c on c.id=o.class_id join app.school_year y on y.id=c.year_id
  join app.subject s on s.id=o.subject_id left join app.curriculum_lesson l on l.id=h.lesson_id
  left join app.homework_roster r on r.homework_id=h.id and r.student_id=child
  left join app.enrollment e on e.id=r.enrollment_id
  where (target is null or h.id=target) and (target_offering is null or h.offering_id=target_offering)
    and (school_class is null or c.id=school_class)
    and ((child is null and app.homework_staff_scope(h.offering_id,h.issued_on))
      or (child is not null and r.id is not null and app.has_child_link(child)
        and app.homework_roster_available(r.joined_on,h.issued_on,e.effective_from,e.effective_until,e.voided_at,r.marked_at,app.school_today())))
$$;

create function app.write_homework(
  target uuid,target_offering uuid,attached_lesson uuid,new_title text,new_instructions text,issue_day date,due_day date,expected_revision integer
) returns table(id uuid,revision integer)
language plpgsql security definer set search_path=pg_catalog
as $$
declare stored app.homework%rowtype;
declare class_ref uuid;
begin
  perform app.lock_school_calendar();
  if target is not null then
    select h.* into stored from app.homework h where h.id=target for update;
    if not found or not app.homework_staff_scope(stored.offering_id,stored.issued_on,'academics.plan') then
      raise exception 'Homework is unavailable' using errcode='42501';
    end if;
    if stored.revision<>expected_revision then return; end if;
    target_offering:=stored.offering_id;
  end if;
  if not app.homework_writable(target_offering,issue_day,due_day) then
    raise exception 'Homework dates are outside scope or school term' using errcode='23P01';
  end if;
  select o.class_id into class_ref from app.class_subject o where o.id=target_offering;
  perform app.lock_classes(class_ref);
  if attached_lesson is not null and not exists(
    select 1 from app.curriculum_lesson l where l.id=attached_lesson and l.offering_id=target_offering
  ) then raise exception 'Lesson is outside this homework offering' using errcode='23514'; end if;
  if target is not null and stored.issued_on<>issue_day and exists(
    select 1 from app.homework_roster r where r.homework_id=target and r.marked_at is not null
  ) then raise exception 'Homework issue date is fixed after grading' using errcode='23P01'; end if;
  if target is null then
    insert into app.homework(offering_id,lesson_id,title,instructions,issued_on,due_on,author_id)
      values(target_offering,attached_lesson,btrim(new_title),btrim(new_instructions),issue_day,due_day,app.actor_account())
      returning * into stored;
  else
    update app.homework h set lesson_id=attached_lesson,title=btrim(new_title),instructions=btrim(new_instructions),
      issued_on=issue_day,due_on=due_day,revision=h.revision+1
      where h.id=target returning * into stored;
  end if;
  perform app.sync_homework_roster(stored.id);
  return query select stored.id,stored.revision;
end
$$;

insert into app.audit_action_rule(action,resource_kind,change_category,allowed_capabilities) values
  ('academics.homework_assigned','academics','creation',array['academics.supervise']),
  ('academics.homework_updated','academics','update',array['academics.supervise']);

revoke all on function app.homework_on_enrollment(),app.sync_homework_roster(uuid,uuid),
  app.homework_roster_available(date,date,date,date,timestamptz,timestamptz,date),app.homework_staff_scope(uuid,date,text),
  app.homework_writable(uuid,date,date),app.homework_projection(uuid,uuid,uuid,uuid),
  app.write_homework(uuid,uuid,uuid,text,text,date,date,integer) from public,anon,authenticated,service_role;
grant execute on function app.homework_staff_scope(uuid,date,text),app.homework_projection(uuid,uuid,uuid,uuid),
  app.write_homework(uuid,uuid,uuid,text,text,date,date,integer) to app_runtime;
