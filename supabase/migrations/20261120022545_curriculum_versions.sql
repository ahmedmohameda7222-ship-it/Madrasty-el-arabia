alter table app.subject
  add column description_ar text not null default '' check(char_length(description_ar)<=3000),
  add column description_de text not null default '' check(char_length(description_de)<=3000),
  add column archived_at timestamptz,
  add constraint academic_subject_names check(
    char_length(btrim(name_ar)) between 1 and 160 and char_length(btrim(name_de)) between 1 and 160
  );

update app.subject set name_de='Sīra' where code='SEERAH';

create function app.academic_offering_scope(target uuid,local_day date,capability text default null)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
  select exists (
    select 1 from app.class_subject o join app.school_class c on c.id=o.class_id
    join app.school_year y on y.id=c.year_id
    where o.id=target and local_day>=y.starts_on and local_day<y.ends_exclusive
      and (app.has_capability('academics.supervise') or (
        capability is null and (app.teacher_scope(c.id,local_day,'academics.plan',o.id)
          or app.teacher_scope(c.id,local_day,'academics.publish',o.id)
          or app.teacher_scope(c.id,local_day,'academics.log',o.id)
          or app.teacher_scope(c.id,local_day,'academics.grade',o.id))
      ) or (
        capability in ('academics.plan','academics.publish','academics.log','academics.grade')
          and app.teacher_scope(c.id,local_day,capability,o.id)
      ))
  )
$$;

create function app.academic_child_offering(child uuid,target uuid,local_day date)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
  select app.has_child_link(child) and exists(
    select 1 from app.class_subject o join app.enrollment e on e.class_id=o.class_id
    where o.id=target and e.student_id=child and e.voided_at is null
      and e.effective_from<=local_day and local_day<e.effective_until
  )
$$;

create function app.valid_lesson_text(source_language text,title_ar text,body_ar text,title_de text,body_de text)
returns boolean language sql immutable set search_path=pg_catalog
as $$
  select source_language in ('ar','de') and
    char_length(title_ar)<=200 and char_length(title_de)<=200 and
    char_length(body_ar)<=12000 and char_length(body_de)<=12000 and
    (case source_language
      when 'ar' then btrim(title_ar)<>'' and btrim(body_ar)<>'' and (btrim(title_de)='')=(btrim(body_de)='')
      when 'de' then btrim(title_de)<>'' and btrim(body_de)<>'' and (btrim(title_ar)='')=(btrim(body_ar)='')
    end)
$$;

create table app.curriculum_unit (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references app.class_subject,
  created_by uuid not null references app.account,
  unique(id,offering_id)
);
alter table app.curriculum_unit enable row level security;

create table app.curriculum_lesson (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references app.class_subject,
  unit_id uuid not null references app.curriculum_unit,
  sort_order integer not null check(sort_order between 0 and 10000),
  scope_date date not null,
  planned_date date,
  source_language text not null,
  title_ar text not null,
  body_ar text not null,
  title_de text not null,
  body_de text not null,
  author_id uuid not null references app.account,
  last_editor_id uuid not null references app.account,
  revision integer not null default 1 check(revision>=1),
  published_id uuid,
  foreign key(unit_id,offering_id) references app.curriculum_unit(id,offering_id),
  check(planned_date is null or planned_date=scope_date),
  check(app.valid_lesson_text(source_language,title_ar,body_ar,title_de,body_de))
);
create index curriculum_lesson_offering_order on app.curriculum_lesson(offering_id,sort_order,id);

create table app.curriculum_publication (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references app.curriculum_lesson,
  revision integer not null check(revision>=1),
  unit_id uuid not null references app.curriculum_unit,
  sort_order integer not null check(sort_order between 0 and 10000),
  scope_date date not null,
  planned_date date,
  source_language text not null,
  title_ar text not null,
  body_ar text not null,
  title_de text not null,
  body_de text not null,
  author_id uuid not null references app.account,
  published_by uuid not null references app.account,
  published_at timestamptz not null default now(),
  unique(lesson_id,revision),
  unique(lesson_id,id),
  check(planned_date is null or planned_date=scope_date),
  check(app.valid_lesson_text(source_language,title_ar,body_ar,title_de,body_de))
);
alter table app.curriculum_lesson add constraint curriculum_current_publication
  foreign key(id,published_id) references app.curriculum_publication(lesson_id,id);

alter table app.curriculum_lesson enable row level security;
alter table app.curriculum_publication enable row level security;

grant insert(code,name_ar,name_de,description_ar,description_de),
  update(name_ar,name_de,description_ar,description_de,archived_at,revision) on app.subject to app_runtime;
create policy academic_subject_read on app.subject for select to app_runtime using(app.has_capability('academics.supervise'));
create policy academic_subject_create on app.subject for insert to app_runtime with check(app.has_capability('academics.supervise'));
create policy academic_subject_edit on app.subject for update to app_runtime
using(app.has_capability('academics.supervise')) with check(app.has_capability('academics.supervise'));

create function app.prevent_new_archived_offering() returns trigger
language plpgsql security definer set search_path=pg_catalog
as $$
begin
  if tg_op='UPDATE' and new.subject_id=old.subject_id then return new; end if;
  perform app.lock_school_calendar();
  if exists(select 1 from app.subject s where s.id=new.subject_id and s.archived_at is not null) then
    raise exception 'Subject is archived' using errcode='23P01';
  end if;
  return new;
end
$$;
create trigger prevent_new_archived_offering before insert or update of subject_id on app.class_subject
for each row execute function app.prevent_new_archived_offering();

create function app.curriculum_offerings(child uuid)
returns table(id uuid,subject_id uuid,class_id uuid,class_code text,class_name_ar text,class_name_de text,
  year_id uuid,year_start date,year_end date,can_plan boolean,can_publish boolean)
language sql stable security definer set search_path=pg_catalog
as $$
  select o.id,s.id,c.id,c.code,c.name_ar,c.name_de,y.id,y.starts_on,y.ends_exclusive,
    child is null and y.state='active' and s.archived_at is null and app.academic_offering_scope(o.id,app.school_today(),'academics.plan'),
    child is null and y.state='active' and s.archived_at is null and app.academic_offering_scope(o.id,app.school_today(),'academics.publish')
  from app.class_subject o join app.subject s on s.id=o.subject_id join app.school_class c on c.id=o.class_id
  join app.school_year y on y.id=c.year_id
  where y.state in ('active','closed') and (
    (child is null and (app.has_capability('academics.supervise') or app.academic_offering_scope(o.id,app.school_today())))
    or (child is not null and (app.academic_child_offering(child,o.id,app.school_today())
      or exists (
        select 1 from app.curriculum_lesson l join app.curriculum_publication p on p.id=l.published_id
        where l.offering_id=o.id and app.academic_child_offering(child,o.id,p.scope_date)
      )))
  )
$$;

create function app.curriculum_subjects(child uuid)
returns table(id uuid,code text,name_ar text,name_de text,description_ar text,description_de text,archived boolean,revision integer)
language sql stable security definer set search_path=pg_catalog
as $$
  select s.id,s.code,s.name_ar,s.name_de,s.description_ar,s.description_de,s.archived_at is not null,s.revision
  from app.subject s
  where (child is null and app.has_capability('academics.supervise'))
    or exists(select 1 from app.curriculum_offerings(child) o where o.subject_id=s.id)
$$;

create function app.curriculum_projection(child uuid,offering uuid,target uuid)
returns table(id uuid,offering_id uuid,unit_id uuid,sort_order integer,planned_date date,source_language text,
  title_ar text,body_ar text,title_de text,body_de text,revision integer,
  publication_id uuid,published_at timestamptz,published_revision integer,can_edit boolean,can_publish boolean)
language sql stable security definer set search_path=pg_catalog
as $$
  select l.id,l.offering_id,
    case when child is null then l.unit_id else p.unit_id end,
    case when child is null then l.sort_order else p.sort_order end,
    case when child is null then l.planned_date else p.planned_date end,
    case when child is null then l.source_language else p.source_language end,
    case when child is null then l.title_ar else p.title_ar end,
    case when child is null then l.body_ar else p.body_ar end,
    case when child is null then l.title_de else p.title_de end,
    case when child is null then l.body_de else p.body_de end,
    case when child is null then l.revision else p.revision end,
    p.id,p.published_at,p.revision,
    child is null and y.state='active' and s.archived_at is null and app.academic_offering_scope(l.offering_id,l.scope_date,'academics.plan'),
    child is null and y.state='active' and s.archived_at is null and app.academic_offering_scope(l.offering_id,l.scope_date,'academics.publish')
  from app.curriculum_lesson l left join app.curriculum_publication p on p.id=l.published_id
  join app.class_subject o on o.id=l.offering_id join app.subject s on s.id=o.subject_id
  join app.school_class c on c.id=o.class_id join app.school_year y on y.id=c.year_id
  where (target is null or l.id=target) and (offering is null or l.offering_id=offering)
    and ((child is null and app.academic_offering_scope(l.offering_id,l.scope_date))
      or (child is not null and p.id is not null and app.academic_child_offering(child,l.offering_id,p.scope_date)))
$$;

create function app.curriculum_require_draft_scope(target uuid,operation text)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
  select exists(
    select 1 from app.curriculum_lesson l where l.id=target
      and app.academic_offering_scope(l.offering_id,l.scope_date,operation)
  )
$$;

create function app.save_curriculum_draft(
  target uuid,offering uuid,unit_key uuid,order_index integer,plan_day date,language_key text,
  ar_title text,ar_body text,de_title text,de_body text,expected_rev integer
) returns table(lesson_id uuid,result_revision integer)
language plpgsql security definer set search_path=pg_catalog
as $$
declare stored app.curriculum_lesson%rowtype;
declare next_day date;
declare unit_ref uuid;
begin
  perform app.lock_school_calendar();
  if target is not null then
    select l.* into stored from app.curriculum_lesson l where l.id=target for update;
    if not found or not app.academic_offering_scope(stored.offering_id,stored.scope_date,'academics.plan') then
      raise exception 'Lesson is unavailable' using errcode='42501';
    end if;
    if stored.revision<>expected_rev then return; end if;
    offering:=stored.offering_id;
  end if;
  next_day:=coalesce(plan_day,stored.scope_date,app.school_today());
  if not app.academic_offering_scope(offering,next_day,'academics.plan') then
    raise exception 'Lesson is outside planning scope' using errcode='42501';
  end if;
  if not exists(
    select 1 from app.class_subject o join app.subject s on s.id=o.subject_id
      join app.school_class c on c.id=o.class_id join app.school_year y on y.id=c.year_id
    where o.id=offering and s.archived_at is null and y.state='active'
      and (plan_day is null or app.is_teaching_day(c.id,plan_day))
  ) then raise exception 'Lesson date or subject is unavailable' using errcode='23P01'; end if;
  unit_ref:=coalesce(unit_key,stored.unit_id);
  if unit_ref is null then
    insert into app.curriculum_unit as u(offering_id,created_by) values(offering,app.actor_account()) returning u.id into unit_ref;
  elsif not exists(select 1 from app.curriculum_unit u where u.id=unit_ref and u.offering_id=offering) then
    raise exception 'Curriculum unit is outside scope' using errcode='23514';
  end if;
  if target is null then
    return query insert into app.curriculum_lesson as l(offering_id,unit_id,sort_order,scope_date,planned_date,source_language,
      title_ar,body_ar,title_de,body_de,author_id,last_editor_id)
      values(offering,unit_ref,order_index,next_day,plan_day,language_key,
        ar_title,ar_body,de_title,de_body,app.actor_account(),app.actor_account()) returning l.id,l.revision;
  else
    return query update app.curriculum_lesson l set unit_id=unit_ref,sort_order=order_index,
      scope_date=next_day,planned_date=plan_day,source_language=language_key,title_ar=ar_title,body_ar=ar_body,
      title_de=de_title,body_de=de_body,revision=l.revision+1,last_editor_id=app.actor_account()
      where l.id=target returning l.id,l.revision;
  end if;
end
$$;

create function app.publish_curriculum_draft(target uuid,expected_rev integer)
returns table(publication_id uuid,publication_time timestamptz,result_revision integer)
language plpgsql security definer set search_path=pg_catalog
as $$
declare draft app.curriculum_lesson%rowtype;
declare publication app.curriculum_publication%rowtype;
begin
  perform app.lock_school_calendar();
  select l.* into draft from app.curriculum_lesson l where l.id=target for update;
  if not found or not app.academic_offering_scope(draft.offering_id,draft.scope_date,'academics.publish') then
    raise exception 'Lesson is outside publishing scope' using errcode='42501';
  end if;
  if draft.revision<>expected_rev then return; end if;
  if not exists(
    select 1 from app.class_subject o join app.subject s on s.id=o.subject_id
      join app.school_class c on c.id=o.class_id join app.school_year y on y.id=c.year_id
    where o.id=draft.offering_id and s.archived_at is null and y.state='active'
      and (draft.planned_date is null or app.is_teaching_day(c.id,draft.planned_date))
  ) then raise exception 'Lesson date or subject is unavailable' using errcode='23P01'; end if;
  if draft.published_id is not null and exists(
    select 1 from app.curriculum_publication v where v.id=draft.published_id and v.revision=draft.revision
  ) then raise exception 'Lesson revision has already been published' using errcode='23P01'; end if;
  insert into app.curriculum_publication(lesson_id,revision,unit_id,sort_order,scope_date,planned_date,source_language,
    title_ar,body_ar,title_de,body_de,author_id,published_by)
    values (draft.id,draft.revision,draft.unit_id,draft.sort_order,draft.scope_date,draft.planned_date,draft.source_language,
      draft.title_ar,draft.body_ar,draft.title_de,draft.body_de,draft.last_editor_id,app.actor_account())
    returning * into publication;
  update app.curriculum_lesson l set published_id=publication.id where l.id=draft.id;
  return query select publication.id,publication.published_at,draft.revision;
end
$$;

insert into app.audit_action_rule(action,resource_kind,change_category,allowed_capabilities) values
  ('academics.subject_created','academics','creation',array['academics.supervise']),
  ('academics.subject_updated','academics','update',array['academics.supervise']),
  ('academics.lesson_created','academics','creation',array['academics.supervise']),
  ('academics.lesson_updated','academics','update',array['academics.supervise']),
  ('academics.lesson_published','academics','publication',array['academics.supervise']);

revoke all on function app.academic_offering_scope(uuid,date,text),app.academic_child_offering(uuid,uuid,date),
  app.valid_lesson_text(text,text,text,text,text),app.prevent_new_archived_offering(),app.curriculum_offerings(uuid),
  app.curriculum_subjects(uuid),app.curriculum_projection(uuid,uuid,uuid),app.curriculum_require_draft_scope(uuid,text),
  app.save_curriculum_draft(uuid,uuid,uuid,integer,date,text,text,text,text,text,integer),
  app.publish_curriculum_draft(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function app.academic_offering_scope(uuid,date,text),app.academic_child_offering(uuid,uuid,date),
  app.curriculum_offerings(uuid),app.curriculum_subjects(uuid),app.curriculum_projection(uuid,uuid,uuid),
  app.curriculum_require_draft_scope(uuid,text),app.save_curriculum_draft(uuid,uuid,uuid,integer,date,text,text,text,text,text,integer),
  app.publish_curriculum_draft(uuid,integer) to app_runtime;
