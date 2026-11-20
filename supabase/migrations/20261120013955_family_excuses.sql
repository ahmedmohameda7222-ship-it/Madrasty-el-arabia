alter table app.attendance_row add constraint attendance_row_child_day unique(id,student_id,school_date);

create table app.family_excuse (
  id uuid primary key default gen_random_uuid(),
  row_id uuid not null,
  student_id uuid not null references app.student,
  school_date date not null,
  reporter_id uuid not null references app.account,
  reason text not null check (char_length(trim(reason)) between 1 and 500),
  state text not null default 'pending' check (state in ('pending','withdrawn','superseded')),
  status_before app.attendance_status,
  revision integer not null default 1 check (revision >= 1),
  submitted_at timestamptz not null default now(),
  ended_at timestamptz,
  foreign key(row_id,student_id,school_date) references app.attendance_row(id,student_id,school_date),
  check ((state='pending') = (ended_at is null))
);
create unique index one_pending_excuse_per_day on app.family_excuse(student_id,school_date) where state='pending';
create index own_excuses_by_day on app.family_excuse(reporter_id,student_id,school_date,submitted_at desc);

create table app.attendance_arrival (
  id uuid primary key default gen_random_uuid(),
  row_id uuid not null unique references app.attendance_row,
  actor_id uuid not null references app.account,
  excuse_id uuid references app.family_excuse,
  status app.attendance_status not null check (status in ('present','late')),
  previous_status app.attendance_status,
  row_revision integer not null check (row_revision >= 1),
  occurred_at timestamptz not null
);

create table app.attendance_row_notice (
  sequence bigint generated always as identity primary key,
  sheet_id uuid not null references app.attendance_sheet,
  row_id uuid not null references app.attendance_row,
  revision integer not null check (revision >= 1)
);
create index attendance_row_notice_sheet on app.attendance_row_notice(sheet_id,sequence);

alter table app.family_excuse enable row level security;
alter table app.attendance_arrival enable row level security;
alter table app.attendance_row_notice enable row level security;

grant select on app.family_excuse,app.attendance_row_notice to app_runtime;
create policy family_own_excuses on app.family_excuse for select to app_runtime
  using (reporter_id=app.actor_account() and app.has_child_link(student_id));
create policy attendance_notices_visible on app.attendance_row_notice for select to app_runtime
  using (exists(select 1 from app.attendance_sheet s where s.id=sheet_id));

create function app.publish_attendance_row_notice() returns trigger
language plpgsql security definer set search_path = pg_catalog
as $$
begin
  if tg_op='UPDATE' and old.sheet_id is not null and old.sheet_id is distinct from new.sheet_id then
    insert into app.attendance_row_notice(sheet_id,row_id,revision) values(old.sheet_id,new.id,new.revision);
  end if;
  if new.sheet_id is not null then
    insert into app.attendance_row_notice(sheet_id,row_id,revision) values(new.sheet_id,new.id,new.revision);
  end if;
  return new;
end
$$;
create trigger publish_attendance_row_notice after insert or update on app.attendance_row
for each row execute function app.publish_attendance_row_notice();

create function app.materialize_attendance_sheet(target uuid,local_day date)
returns table(sheet_id uuid,created boolean)
language plpgsql security definer set search_path = pg_catalog
as $$
declare school_year uuid; sheet_key uuid; is_new boolean;
begin
  select c.year_id into school_year from app.school_class c where c.id=target;
  insert into app.attendance_sheet(class_id,year_id,school_date)
    values(target,school_year,local_day) on conflict(class_id,school_date) do nothing returning id into sheet_key;
  is_new:=found;
  if not is_new then
    select s.id into sheet_key from app.attendance_sheet s where s.class_id=target and s.school_date=local_day;
  end if;
  perform app.sync_attendance_roster(sheet_key);
  return query select sheet_key,is_new;
end
$$;

create or replace function app.open_attendance_day(target uuid,local_day date)
returns table(sheet_id uuid,created boolean)
language plpgsql security definer set search_path = pg_catalog
as $$
begin
  perform app.lock_school_calendar();
  perform app.lock_classes(target);
  if not (app.attendance_scope(target,local_day,'attendance.mark') or app.attendance_scope(target,local_day,'attendance.approve')) then
    raise exception 'Attendance scope denied' using errcode='42501';
  end if;
  if not app.attendance_open_for_writes(target,local_day) then
    raise exception 'Attendance date closed' using errcode='23P01';
  end if;
  return query select * from app.materialize_attendance_sheet(target,local_day);
end
$$;

create function app.lock_excuse_child_link(child uuid) returns void
language plpgsql security definer set search_path = pg_catalog
as $$
begin
  if app.actor_persona() is distinct from 'guardian'::app.persona then
    raise exception 'Child attendance scope denied' using errcode='42501';
  end if;
  perform 1 from app.child_link l join app.guardian_profile g on g.id=l.guardian_id
    where g.account_id=app.actor_account() and l.student_id=child and l.state='approved'
      and l.effective_from<=now() and (l.effective_until is null or l.effective_until>now())
    for share of l,g;
  if not found then raise exception 'Child attendance scope denied' using errcode='42501'; end if;
end
$$;

create function app.family_excuse_day(child uuid,local_day date) returns boolean
language sql stable security definer set search_path = pg_catalog
as $$
  select app.has_child_link(child) and coalesce(app.attendance_open_for_writes(app.class_for_student(child,local_day),local_day),false)
$$;

create function app.record_family_excuse(child uuid,local_day date,reported_reason text)
returns table(excuse_key uuid,row_revision integer)
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  target_class uuid;
  target_sheet uuid;
  attendance app.attendance_row%rowtype;
  created_key uuid;
  new_revision integer;
begin
  perform app.lock_school_calendar();
  perform app.lock_excuse_child_link(child);
  target_class:=app.class_for_student(child,local_day);
  if target_class is null or not app.attendance_open_for_writes(target_class,local_day) then
    raise exception 'Attendance date closed' using errcode='23P01';
  end if;
  perform app.lock_classes(target_class);
  select opened.sheet_id into target_sheet from app.materialize_attendance_sheet(target_class,local_day) opened;
  if not exists(select 1 from app.attendance_sheet s where s.id=target_sheet and s.state='open') then
    raise exception 'Attendance already approved' using errcode='23P01';
  end if;
  select * into attendance from app.attendance_row r where r.sheet_id=target_sheet and r.student_id=child for update;
  if not found or attendance.confirmed_arrival_at is not null or attendance.lock_source is not null then
    raise exception 'Attendance already confirmed or excused' using errcode='23P01';
  end if;
  insert into app.family_excuse(row_id,student_id,school_date,reporter_id,reason,status_before)
    values(attendance.id,child,local_day,app.actor_account(),trim(reported_reason),attendance.status)
    returning id into created_key;
  update app.attendance_row r set status='absent_excused',lock_source='family_excuse',revision=r.revision+1
    where r.id=attendance.id returning r.revision into new_revision;
  return query select created_key,new_revision;
end
$$;

create function app.withdraw_family_excuse(child uuid,excuse_key uuid,expected_revision integer)
returns integer
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  source app.family_excuse%rowtype;
  attendance app.attendance_row%rowtype;
  sheet_class uuid;
  sheet_state text;
  new_revision integer;
begin
  perform app.lock_school_calendar();
  perform app.lock_excuse_child_link(child);
  select * into source from app.family_excuse e
    where e.id=excuse_key and e.student_id=child and e.reporter_id=app.actor_account();
  if not found then raise exception 'Excuse scope denied' using errcode='42501'; end if;
  select r.* into attendance from app.attendance_row r where r.id=source.row_id;
  if attendance.sheet_id is not null then
    select s.class_id into sheet_class from app.attendance_sheet s where s.id=attendance.sheet_id;
    perform app.lock_classes(sheet_class);
    select s.state into sheet_state from app.attendance_sheet s where s.id=attendance.sheet_id for update;
  end if;
  select r.* into attendance from app.attendance_row r where r.id=source.row_id for update;
  select e.* into source from app.family_excuse e where e.id=excuse_key for update;
  if source.revision<>expected_revision then return null; end if;
  if source.state<>'pending' or sheet_state='approved' or attendance.confirmed_arrival_at is not null then
    raise exception 'Excuse cannot be withdrawn' using errcode='23P01';
  end if;
  update app.family_excuse e set state='withdrawn',ended_at=now(),revision=e.revision+1 where e.id=source.id;
  update app.attendance_row r set status=source.status_before,lock_source=null,revision=r.revision+1
    where r.id=attendance.id returning r.revision into new_revision;
  return new_revision;
end
$$;

create function app.family_excuse_receipts(child uuid,local_day date,receipt_id uuid default null)
returns table(id uuid,student_id uuid,school_date date,reason text,state text,revision integer,
  row_revision integer,submitted_at timestamptz,withdrawable boolean)
language sql stable security definer set search_path = pg_catalog
as $$
  select e.id,e.student_id,e.school_date,e.reason,e.state,e.revision,r.revision,e.submitted_at,
    e.state='pending' and coalesce(s.state,'open')='open' and r.confirmed_arrival_at is null
  from app.family_excuse e join app.attendance_row r on r.id=e.row_id
  left join app.attendance_sheet s on s.id=r.sheet_id
  where e.student_id=child and e.school_date=local_day and app.has_child_link(child)
    and e.reporter_id=app.actor_account() and (receipt_id is null or e.id=receipt_id)
  order by e.submitted_at desc,e.id desc
$$;

create function app.private_attendance_row(target uuid)
returns table(sheet_id uuid,class_id uuid,school_date date,row_payload jsonb,excuse_reason text)
language sql stable security definer set search_path = pg_catalog
as $$
  select s.id,s.class_id,s.school_date,
    jsonb_build_object('id',r.id,'studentId',r.student_id,'studentNumber',p.student_number,'displayName',p.display_name,
      'enrollmentId',r.enrollment_id,'status',r.status,'revision',r.revision,'locked',r.lock_source is not null,
      'confirmedArrivalAt',to_char(r.confirmed_arrival_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    case when app.attendance_scope(s.class_id,s.school_date,'attendance.mark')
      or app.attendance_scope(s.class_id,s.school_date,'attendance.approve') then e.reason end
  from app.attendance_row r join app.attendance_sheet s on s.id=r.sheet_id join app.student p on p.id=r.student_id
  left join app.family_excuse e on e.row_id=r.id and e.state='pending'
  where r.id=target and app.attendance_scope(s.class_id,s.school_date,'attendance.read')
$$;

create function app.confirm_actual_arrival(target uuid,expected_revision integer,actual_status app.attendance_status)
returns table(result text,preceding_excuse boolean)
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  original_sheet uuid;
  record_row app.attendance_row%rowtype;
  active_excuse uuid;
  stamp timestamptz:=now();
begin
  if actual_status is null or actual_status not in ('present','late') then
    raise exception 'Invalid arrival status' using errcode='23514';
  end if;
  perform app.lock_school_calendar();
  select r.sheet_id into original_sheet from app.attendance_row r where r.id=target;
  if not found or original_sheet is null then raise exception 'Arrival scope denied' using errcode='42501'; end if;
  perform app.lock_attendance_sheet(original_sheet,'attendance.mark');
  select r.* into record_row from app.attendance_row r where r.id=target and r.sheet_id=original_sheet for update;
  if not found or record_row.revision<>expected_revision then
    return query select 'stale'::text,false;
    return;
  end if;
  if record_row.confirmed_arrival_at is not null then
    raise exception 'Arrival is already confirmed' using errcode='23P01';
  end if;
  update app.family_excuse e set state='superseded',ended_at=stamp,revision=e.revision+1
    where e.row_id=target and e.state='pending' returning e.id into active_excuse;
  insert into app.attendance_arrival(row_id,actor_id,excuse_id,status,previous_status,row_revision,occurred_at)
    values(target,app.actor_account(),active_excuse,actual_status,record_row.status,record_row.revision+1,stamp);
  update app.attendance_row r set status=actual_status,lock_source=null,revision=r.revision+1,
    confirmed_arrival_at=stamp,confirmed_arrival_by=app.actor_account() where r.id=target;
  return query select 'recorded'::text,active_excuse is not null;
end
$$;

revoke all on function app.publish_attendance_row_notice(),app.materialize_attendance_sheet(uuid,date),
  app.lock_excuse_child_link(uuid),app.family_excuse_day(uuid,date),app.record_family_excuse(uuid,date,text),
  app.withdraw_family_excuse(uuid,uuid,integer),app.family_excuse_receipts(uuid,date,uuid),app.private_attendance_row(uuid),
  app.confirm_actual_arrival(uuid,integer,app.attendance_status) from public,anon,authenticated,service_role;
grant execute on function app.family_excuse_day(uuid,date),app.record_family_excuse(uuid,date,text),
  app.withdraw_family_excuse(uuid,uuid,integer),app.family_excuse_receipts(uuid,date,uuid),app.private_attendance_row(uuid),
  app.confirm_actual_arrival(uuid,integer,app.attendance_status) to app_runtime;
