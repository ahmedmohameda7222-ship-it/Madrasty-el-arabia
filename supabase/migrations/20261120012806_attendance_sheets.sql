create type app.attendance_status as enum ('present','late','absent_unexcused','absent_excused');

create table app.attendance_sheet (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null,
  year_id uuid not null,
  school_date date not null,
  state text not null default 'open' check (state in ('open','approved')),
  roster_revision integer not null default 1 check (roster_revision > 0),
  approval_revision integer not null default 1 check (approval_revision > 0),
  approved_by uuid references app.account,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (class_id,year_id) references app.school_class(id,year_id),
  unique (class_id,school_date),
  unique (id,school_date),
  check ((state = 'approved') = (approved_by is not null and approved_at is not null)),
  check ((approved_by is null) = (approved_at is null))
);
create index attendance_pending_on_day on app.attendance_sheet(school_date,id) where state='open';

create table app.attendance_row (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid,
  student_id uuid not null references app.student,
  enrollment_id uuid references app.enrollment,
  school_date date not null,
  status app.attendance_status,
  revision integer not null default 1 check (revision > 0),
  lock_source text check (lock_source = 'family_excuse'),
  confirmed_arrival_by uuid references app.account,
  confirmed_arrival_at timestamptz,
  foreign key (sheet_id,school_date) references app.attendance_sheet(id,school_date),
  unique (sheet_id,student_id),
  unique (student_id,school_date),
  check ((sheet_id is null) = (enrollment_id is null)),
  check ((confirmed_arrival_by is null) = (confirmed_arrival_at is null)),
  check (confirmed_arrival_at is null or (status is not null and status in ('present','late') and lock_source is null)),
  check (lock_source is null or (status is not null and status='absent_excused'))
);
create index attendance_sheet_rows_idx on app.attendance_row(sheet_id,id) where sheet_id is not null;

create function app.attendance_scope(target uuid,local_day date,operation text)
returns boolean
language sql stable security definer set search_path = pg_catalog
as $$
  select exists (
    select 1 from app.school_class c join app.school_year y on y.id=c.year_id
    where c.id=target and local_day>=y.starts_on and local_day<y.ends_exclusive and y.state in ('active','closed')
      and operation in ('attendance.read','attendance.mark','attendance.approve')
      and (
        app.has_capability('attendance.supervise')
        or (operation='attendance.read' and (
          app.teacher_scope(c.id,local_day,'attendance.read')
          or app.teacher_scope(c.id,local_day,'attendance.mark')
          or app.teacher_scope(c.id,local_day,'attendance.approve')
        ))
        or (operation in ('attendance.mark','attendance.approve') and app.teacher_scope(c.id,local_day,operation))
      )
  )
$$;

create function app.attendance_open_for_writes(target uuid,local_day date)
returns boolean
language sql stable security definer set search_path = pg_catalog
as $$
  select exists (
    select 1 from app.school_class c join app.school_year y on y.id=c.year_id
    where c.id=target and y.state='active' and app.is_teaching_day(target,local_day)
  )
$$;

create function app.attendance_class_day(target uuid,local_day date)
returns table(class_id uuid,year_id uuid,class_code text,class_name_ar text,class_name_de text,
  teaching_day boolean,closed_reason text,can_mark boolean,can_approve boolean)
language sql stable security definer set search_path = pg_catalog
as $$
  select c.id,c.year_id,c.code,c.name_ar,c.name_de,app.is_teaching_day(c.id,local_day),
    case when not app.is_teaching_day(c.id,local_day) then (
      select e.reason from app.day_exception e where e.year_id=c.year_id and e.school_date=local_day
        and (e.class_id is null or e.class_id=c.id)
      order by e.class_id is not null desc limit 1
    ) end,
    app.attendance_open_for_writes(c.id,local_day) and app.attendance_scope(c.id,local_day,'attendance.mark'),
    app.attendance_open_for_writes(c.id,local_day) and app.attendance_scope(c.id,local_day,'attendance.approve')
  from app.school_class c where c.id=target and app.attendance_scope(c.id,local_day,'attendance.read')
$$;

create function app.attendance_classes(local_day date)
returns table(id uuid,code text,name_ar text,name_de text)
language sql stable security definer set search_path = pg_catalog
as $$
  select c.id,c.code,c.name_ar,c.name_de
  from app.school_class c
  where app.attendance_scope(c.id,local_day,'attendance.read')
  order by c.code,c.id
$$;

create function app.attendance_sheet_matches(target app.attendance_sheet)
returns boolean
language sql stable security definer set search_path = pg_catalog
as $$
  select not exists (
    select 1 from app.roster_on(target.class_id,target.school_date) e
    full join (select student_id,enrollment_id from app.attendance_row where sheet_id=target.id) r
      on r.student_id=e.student_id and r.enrollment_id=e.enrollment_id
    where e.student_id is null or r.student_id is null
  )
$$;

create function app.sync_attendance_roster(sheet_key uuid) returns void
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  target app.attendance_sheet%rowtype;
  removed integer;
  added integer;
begin
  select * into target from app.attendance_sheet where id=sheet_key for update;
  if not found then return; end if;
  if target.state='approved' then
    if not app.attendance_sheet_matches(target) then
      raise exception 'Enrollment would change an approved attendance roster' using errcode='23P01';
    end if;
    return;
  end if;

  -- A rescheduled pupil keeps the same student/day facts while awaiting their destination sheet.
  update app.attendance_row r set sheet_id=null,enrollment_id=null,revision=r.revision+1
    where r.sheet_id=sheet_key and not exists (
      select 1 from app.roster_on(target.class_id,target.school_date) e
      where e.student_id=r.student_id and e.enrollment_id=r.enrollment_id
    );
  get diagnostics removed = row_count;

  insert into app.attendance_row as r (sheet_id,student_id,enrollment_id,school_date)
    select sheet_key,e.student_id,e.enrollment_id,target.school_date
    from app.roster_on(target.class_id,target.school_date) e order by e.student_id
    on conflict(student_id,school_date) do update set sheet_id=excluded.sheet_id,
      enrollment_id=excluded.enrollment_id,revision=r.revision+1 where r.sheet_id is null;
  get diagnostics added = row_count;

  if not app.attendance_sheet_matches(target) then
    raise exception 'Child already belongs to another roster for that date' using errcode='23P01';
  end if;
  if removed+added>0 then
    update app.attendance_sheet set roster_revision=roster_revision+1 where id=sheet_key;
  end if;
end
$$;

create function app.attendance_enrollment_changed() returns trigger
language plpgsql security definer set search_path = pg_catalog
as $$
declare target uuid;
begin
  if tg_op='INSERT' then
    for target in select s.id from app.attendance_sheet s
      where new.voided_at is null and s.class_id=new.class_id and s.school_date>=new.effective_from
        and s.school_date<new.effective_until
      order by s.id
    loop perform app.sync_attendance_roster(target); end loop;
  else
    for target in select s.id from app.attendance_sheet s
      where (old.voided_at is null and s.class_id=old.class_id and s.school_date>=old.effective_from and s.school_date<old.effective_until)
        is distinct from
        (new.voided_at is null and s.class_id=new.class_id and s.school_date>=new.effective_from and s.school_date<new.effective_until)
      order by s.id
    loop perform app.sync_attendance_roster(target); end loop;
  end if;
  return new;
end
$$;
create trigger attendance_enrollment_changed after insert or update on app.enrollment
for each row execute function app.attendance_enrollment_changed();

create function app.reject_attendance_closure() returns trigger
language plpgsql security definer set search_path = pg_catalog
as $$
declare affected_year uuid;
begin
  if tg_table_name='day_exception' then
    affected_year := new.year_id;
    if exists(select 1 from app.attendance_sheet s where s.year_id=affected_year and s.state='approved'
        and s.school_date=new.school_date and (new.class_id is null or s.class_id=new.class_id)
        and not app.is_teaching_day(s.class_id,s.school_date)) then
      raise exception 'Calendar change would close approved attendance' using errcode='23P01';
    end if;
  else
    affected_year := new.id;
    if exists (select 1 from app.attendance_sheet s where s.year_id=affected_year and s.state='approved'
        and not app.is_teaching_day(s.class_id,s.school_date)) then
      raise exception 'Calendar change would close approved attendance' using errcode='23P01';
    end if;
  end if;
  return new;
end
$$;
create trigger reject_attendance_closure after insert or update on app.day_exception
for each row execute function app.reject_attendance_closure();
create trigger reject_attendance_year_closure after update of teaching_weekdays,starts_on,ends_exclusive,state on app.school_year
for each row execute function app.reject_attendance_closure();

create function app.open_attendance_day(target uuid,local_day date)
returns table(sheet_id uuid,created boolean)
language plpgsql security definer set search_path = pg_catalog
as $$
declare school_year uuid; sheet_key uuid; is_new boolean;
begin
  perform app.lock_school_calendar();
  perform app.lock_classes(target);
  if not (app.attendance_scope(target,local_day,'attendance.mark') or app.attendance_scope(target,local_day,'attendance.approve')) then
    raise exception 'Attendance scope denied' using errcode='42501';
  end if;
  if not app.attendance_open_for_writes(target,local_day) then
    raise exception 'Attendance date closed' using errcode='23P01';
  end if;
  select c.year_id into school_year from app.school_class c where id=target;
  insert into app.attendance_sheet (class_id,year_id,school_date)
    values (target,school_year,local_day) on conflict(class_id,school_date) do nothing returning id into sheet_key;
  is_new:=found;
  if not is_new then
    select s.id into sheet_key from app.attendance_sheet s where s.class_id=target and s.school_date=local_day;
  end if;
  perform app.sync_attendance_roster(sheet_key);
  return query select sheet_key,is_new;
end
$$;

create function app.lock_attendance_sheet(target uuid,operation text)
returns void
language plpgsql security definer set search_path = pg_catalog
as $$
declare current_sheet app.attendance_sheet%rowtype;
begin
  perform app.lock_school_calendar();
  select * into current_sheet from app.attendance_sheet where id=target;
  if not found or operation is null or operation not in ('attendance.mark','attendance.approve') or
     not app.attendance_scope(current_sheet.class_id,current_sheet.school_date,operation) then
    raise exception 'Attendance scope denied' using errcode='42501';
  end if;
  perform app.lock_classes(current_sheet.class_id);
  if current_sheet.state<>'open' or not app.attendance_open_for_writes(current_sheet.class_id,current_sheet.school_date) then
    raise exception 'Attendance sheet is read-only' using errcode='23P01';
  end if;
  perform app.sync_attendance_roster(target);
  perform 1 from app.attendance_row r where r.sheet_id=target order by r.id for update;
end
$$;

create function app.guard_attendance_approval() returns trigger
language plpgsql security definer set search_path = pg_catalog
as $$
begin
  if old.state='approved' then
    raise exception 'Approved sheet metadata is immutable' using errcode='23P01';
  end if;
  if new.state='approved' and (
    new.approved_by is distinct from app.actor_account() or
    new.approval_revision<>old.approval_revision+1 or
    not app.attendance_open_for_writes(old.class_id,old.school_date) or
    not app.attendance_sheet_matches(old) or
    exists(select 1 from app.attendance_row r where r.sheet_id=old.id and r.status is null)
  ) then
    raise exception 'Attendance roster is incomplete or outdated' using errcode='23P01';
  end if;
  return new;
end
$$;
create trigger guard_attendance_approval before update of state,approved_by,approved_at,approval_revision on app.attendance_sheet
for each row execute function app.guard_attendance_approval();

alter table app.attendance_sheet enable row level security;
alter table app.attendance_row enable row level security;
grant usage on type app.attendance_status to app_runtime;
grant select on app.attendance_sheet,app.attendance_row to app_runtime;
grant update(state,approval_revision,approved_by,approved_at) on app.attendance_sheet to app_runtime;
grant update(status,revision) on app.attendance_row to app_runtime;

create policy attendance_sheet_read on app.attendance_sheet for select to app_runtime
using (app.attendance_scope(class_id,school_date,'attendance.read'));
create policy attendance_sheet_approve on app.attendance_sheet for update to app_runtime
using (app.attendance_scope(class_id,school_date,'attendance.approve'))
with check (app.attendance_scope(class_id,school_date,'attendance.approve'));
create policy attendance_row_read on app.attendance_row for select to app_runtime
using (exists(select 1 from app.attendance_sheet s where s.id=sheet_id));
create policy attendance_row_mark on app.attendance_row for update to app_runtime
using (lock_source is null and confirmed_arrival_at is null and exists (
  select 1 from app.attendance_sheet s where s.id=sheet_id and s.state='open'
    and app.attendance_open_for_writes(s.class_id,s.school_date)
    and app.attendance_scope(s.class_id,s.school_date,'attendance.mark')
))
with check (lock_source is null and confirmed_arrival_at is null and exists (
  select 1 from app.attendance_sheet s where s.id=sheet_id and s.state='open'
    and app.attendance_open_for_writes(s.class_id,s.school_date)
    and app.attendance_scope(s.class_id,s.school_date,'attendance.mark')
));

create function app.attendance_staff_roster(target uuid)
returns table(row_id uuid,student_id uuid,student_number text,display_name text,enrollment_id uuid,
  status app.attendance_status,revision integer,locked boolean,arrival_at timestamptz)
language sql stable security definer set search_path = pg_catalog
as $$
  select r.id,r.student_id,p.student_number,p.display_name,r.enrollment_id,r.status,r.revision,
    r.lock_source is not null,r.confirmed_arrival_at
  from app.attendance_row r join app.attendance_sheet s on s.id=r.sheet_id join app.student p on p.id=r.student_id
  where s.id=target and app.attendance_scope(s.class_id,s.school_date,'attendance.read')
  order by p.display_name,p.student_number,r.id
$$;

revoke all on function app.attendance_scope(uuid,date,text),app.attendance_open_for_writes(uuid,date),
  app.attendance_class_day(uuid,date),app.attendance_classes(date),app.attendance_sheet_matches(app.attendance_sheet),
  app.sync_attendance_roster(uuid),app.attendance_enrollment_changed(),app.reject_attendance_closure(),
  app.open_attendance_day(uuid,date),app.lock_attendance_sheet(uuid,text),app.guard_attendance_approval(),
  app.attendance_staff_roster(uuid) from public,anon,authenticated,service_role;
grant execute on function app.attendance_scope(uuid,date,text),app.attendance_open_for_writes(uuid,date),
  app.attendance_class_day(uuid,date),app.attendance_classes(date),app.open_attendance_day(uuid,date),
  app.lock_attendance_sheet(uuid,text),app.attendance_staff_roster(uuid) to app_runtime;
