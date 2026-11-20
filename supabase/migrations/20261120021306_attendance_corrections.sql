alter table app.attendance_sheet
  add column calendar_cancelled_at timestamptz,
  add column calendar_cancelled_by uuid references app.account,
  add constraint attendance_cancellation_actor check (
    (calendar_cancelled_at is null and calendar_cancelled_by is null)
    or (state='approved' and calendar_cancelled_at is not null and calendar_cancelled_by is not null)
  );

create table app.attendance_approved_revision (
  id uuid primary key default gen_random_uuid(),
  row_id uuid not null references app.attendance_row,
  row_revision integer not null check(row_revision>0),
  previous_revision integer,
  change_kind text not null check(change_kind in ('approval','correction','calendar_cancellation')),
  prior_status app.attendance_status,
  resulting_status app.attendance_status not null,
  actor_id uuid not null references app.account,
  confirmed_arrival_at timestamptz,
  confirmed_arrival_by uuid references app.account,
  private_reason text,
  occurred_at timestamptz not null default now(),
  unique(row_id,row_revision),
  foreign key(row_id,previous_revision) references app.attendance_approved_revision(row_id,row_revision),
  check (
    (change_kind='approval' and previous_revision is null and prior_status is null and private_reason is null)
    or (change_kind<>'approval' and previous_revision is not null and row_revision>previous_revision
      and prior_status is not null and private_reason is not null and char_length(btrim(private_reason)) between 1 and 500)
  )
);

create table app.attendance_approved_event (
  row_id uuid not null,
  row_revision integer not null,
  event_id uuid not null unique references app.outbox_event,
  primary key(row_id,row_revision),
  foreign key(row_id,row_revision) references app.attendance_approved_revision(row_id,row_revision)
);

alter table app.attendance_approved_revision enable row level security;
alter table app.attendance_approved_event enable row level security;

create function app.capture_approved_attendance() returns trigger
language plpgsql security definer set search_path = pg_catalog
as $$
begin
  insert into app.attendance_approved_revision(row_id,row_revision,change_kind,resulting_status,actor_id,occurred_at,
    confirmed_arrival_at,confirmed_arrival_by)
  select r.id,r.revision,'approval',r.status,new.approved_by,new.approved_at,r.confirmed_arrival_at,r.confirmed_arrival_by
  from app.attendance_row r where r.sheet_id=new.id order by r.id;
  return new;
end
$$;
create trigger capture_approved_attendance after update of state on app.attendance_sheet
for each row when (old.state='open' and new.state='approved') execute function app.capture_approved_attendance();

insert into app.attendance_approved_revision(row_id,row_revision,change_kind,resulting_status,actor_id,occurred_at,
  confirmed_arrival_at,confirmed_arrival_by)
select r.id,r.revision,'approval',r.status,s.approved_by,s.approved_at,r.confirmed_arrival_at,r.confirmed_arrival_by
from app.attendance_sheet s join app.attendance_row r on r.sheet_id=s.id
where s.state='approved';

create function app.attach_attendance_approved_event(target uuid,target_revision integer,committed_event uuid)
returns void
language plpgsql security definer set search_path = pg_catalog
as $$
begin
  if not exists(
    select 1 from app.attendance_row r join app.attendance_sheet s on s.id=r.sheet_id
    where r.id=target and r.revision=target_revision and s.state='approved'
      and app.attendance_scope(s.class_id,s.school_date,'attendance.approve')
  ) then raise exception 'Approved event scope denied' using errcode='42501'; end if;
  insert into app.attendance_approved_event(row_id,row_revision,event_id) values(target,target_revision,committed_event);
end
$$;

create function app.correct_attendance_record(target uuid,expected_revision integer,next_status app.attendance_status,explanation text)
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
  if not app.has_capability('attendance.supervise') then raise exception 'Correction scope denied' using errcode='42501'; end if;
  perform app.lock_school_calendar();
  select a.* into sheet from app.attendance_sheet a join app.attendance_row r on r.sheet_id=a.id where r.id=target;
  if not found then raise exception 'Correction scope denied' using errcode='42501'; end if;
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

create or replace function app.reject_attendance_closure() returns trigger
language plpgsql security definer set search_path = pg_catalog
as $$
declare affected_year uuid;
begin
  if tg_table_name='day_exception' then
    affected_year := new.year_id;
    if exists(select 1 from app.attendance_sheet s where s.year_id=affected_year and s.state='approved'
        and s.school_date=new.school_date and (new.class_id is null or s.class_id=new.class_id)
        and (s.calendar_cancelled_at is null) is distinct from app.is_teaching_day(s.class_id,s.school_date)) then
      raise exception 'Calendar change contradicts approved attendance' using errcode='23P01';
    end if;
  else
    affected_year := new.id;
    if exists (select 1 from app.attendance_sheet s where s.year_id=affected_year and s.state='approved'
        and (s.calendar_cancelled_at is null) is distinct from app.is_teaching_day(s.class_id,s.school_date)) then
      raise exception 'Calendar change contradicts approved attendance' using errcode='23P01';
    end if;
  end if;
  return new;
end
$$;

create function app.cancel_approved_attendance_day(target uuid,expected_revision integer,explanation text)
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

create function app.approved_attendance_rows(
  child uuid, school_class uuid, date_from date, date_to date, status_filter text, guardian_view boolean
) returns table(id uuid,student_id uuid,student_name text,student_number text,class_id uuid,class_code text,
  class_name_ar text,class_name_de text,school_date date,status app.attendance_status,revision integer,cancelled boolean)
language sql stable security definer set search_path = pg_catalog
as $$
  select r.id,p.id,p.display_name,p.student_number,c.id,c.code,c.name_ar,c.name_de,s.school_date,
    case when not scoped.cancelled then r.status end,r.revision,scoped.cancelled
  from app.attendance_sheet s join app.attendance_row r on r.sheet_id=s.id
  join app.school_class c on c.id=s.class_id join app.student p on p.id=r.student_id
  cross join lateral (
    select s.calendar_cancelled_at is not null or not app.is_teaching_day(c.id,s.school_date) as cancelled
  ) scoped
  where s.state='approved'
    and ((guardian_view and child is not null and r.student_id=child and app.has_child_link(child))
      or (not guardian_view and app.attendance_scope(c.id,s.school_date,'attendance.read')))
    and (child is null or r.student_id=child)
    and (school_class is null or c.id=school_class)
    and (date_from is null or s.school_date>=date_from) and (date_to is null or s.school_date<=date_to)
    and (status_filter is null or (status_filter='cancelled' and scoped.cancelled)
      or (not scoped.cancelled and r.status::text=status_filter))
$$;

create function app.staff_attendance_revisions(target uuid)
returns table(id uuid,kind text,revision integer,prior_status app.attendance_status,status app.attendance_status,
  actor_name text,occurred_at timestamptz,reason text)
language sql stable security definer set search_path = pg_catalog
as $$
  select v.id,v.change_kind,v.row_revision,v.prior_status,v.resulting_status,p.display_name,v.occurred_at,
    case when app.has_capability('attendance.supervise') then v.private_reason end
  from app.attendance_approved_revision v join app.attendance_row r on r.id=v.row_id
  join app.attendance_sheet s on s.id=r.sheet_id left join app.staff_profile p on p.account_id=v.actor_id
  where r.id=target and app.attendance_scope(s.class_id,s.school_date,'attendance.read')
  order by v.row_revision desc
$$;

create function app.attendance_correction_context(target uuid)
returns table(sheet_id uuid,calendar_cancelled boolean,approval_revision integer,can_correct boolean,can_cancel boolean)
language sql stable security definer set search_path = pg_catalog
as $$
  select s.id,s.calendar_cancelled_at is not null or not app.is_teaching_day(s.class_id,s.school_date),s.approval_revision,
    y.state='active' and app.has_capability('attendance.supervise'),
    y.state='active' and s.calendar_cancelled_at is null
      and app.has_capability('attendance.supervise') and app.has_capability('school.manage')
  from app.attendance_row r join app.attendance_sheet s on s.id=r.sheet_id join app.school_year y on y.id=s.year_id
  where r.id=target and s.state='approved' and app.attendance_scope(s.class_id,s.school_date,'attendance.read')
$$;

create function app.approved_attendance_counts(child uuid,school_class uuid,date_from date,date_to date)
returns table(status app.attendance_status,total bigint)
language sql stable security definer set search_path = pg_catalog
as $$
  select r.status,count(*)
  from app.attendance_row r join app.attendance_sheet s on s.id=r.sheet_id
  where s.state='approved' and s.calendar_cancelled_at is null and r.status is not null
    and app.is_teaching_day(s.class_id,s.school_date)
    and (child is null or r.student_id=child) and (school_class is null or s.class_id=school_class)
    and (date_from is null or s.school_date>=date_from) and (date_to is null or s.school_date<=date_to)
    and (app.has_capability('attendance.supervise') or app.has_capability('academics.supervise')
      or app.teacher_scope(s.class_id,s.school_date,'academics.log')
      or app.attendance_scope(s.class_id,s.school_date,'attendance.read')
      or (child is not null and app.has_child_link(child)))
  group by r.status
$$;

insert into app.audit_action_rule(action,resource_kind,change_category,allowed_capabilities)
values('attendance.calendar_cancelled','attendance','correction',array['attendance.supervise']);

-- C07 grants the delivery role EXECUTE after its jobs and delivery ledger are in place.
create function app.current_unexcused_attendance(target uuid,expected_revision integer)
returns table(student_id uuid,class_id uuid,school_date date)
language sql stable security definer set search_path = pg_catalog
as $$
  select r.student_id,s.class_id,s.school_date
  from app.attendance_row r join app.attendance_sheet s on s.id=r.sheet_id
  where r.id=target and r.revision=expected_revision and r.status='absent_unexcused'
    and s.state='approved' and s.calendar_cancelled_at is null and app.is_teaching_day(s.class_id,s.school_date)
$$;

revoke all on function app.capture_approved_attendance(),app.attach_attendance_approved_event(uuid,integer,uuid),
  app.correct_attendance_record(uuid,integer,app.attendance_status,text),app.cancel_approved_attendance_day(uuid,integer,text),
  app.approved_attendance_rows(uuid,uuid,date,date,text,boolean),app.staff_attendance_revisions(uuid),
  app.current_unexcused_attendance(uuid,integer),app.attendance_correction_context(uuid),
  app.approved_attendance_counts(uuid,uuid,date,date)
from public,anon,authenticated,service_role;
grant execute on function app.attach_attendance_approved_event(uuid,integer,uuid),
  app.correct_attendance_record(uuid,integer,app.attendance_status,text),app.cancel_approved_attendance_day(uuid,integer,text),
  app.approved_attendance_rows(uuid,uuid,date,date,text,boolean),app.staff_attendance_revisions(uuid),
  app.attendance_correction_context(uuid),app.approved_attendance_counts(uuid,uuid,date,date) to app_runtime;
