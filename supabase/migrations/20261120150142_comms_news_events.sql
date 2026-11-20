create function app.valid_school_copy(source text,copies jsonb) returns boolean
language sql immutable set search_path=pg_catalog
as $$
  select coalesce(source in ('ar','de') and jsonb_typeof(copies)='object' and copies ? source
    and not exists (
      select 1 from jsonb_each(case when jsonb_typeof(copies)='object' then copies else '{}'::jsonb end) entry(locale,value)
      where entry.locale not in ('ar','de') or jsonb_typeof(entry.value) is distinct from 'object'
        or jsonb_typeof(entry.value->'title') is distinct from 'string'
        or jsonb_typeof(entry.value->'body') is distinct from 'string'
        or char_length(btrim(entry.value->>'title')) not between 1 and 180
        or char_length(btrim(entry.value->>'body')) not between 1 and 4000
    ),false)
$$;

create table app.school_news (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references app.account,
  author_persona app.persona not null check(author_persona in ('admin','teacher')),
  class_id uuid references app.school_class,
  source_locale text not null check(source_locale in ('ar','de')),
  copy jsonb not null check(app.valid_school_copy(source_locale,copy)),
  state text not null default 'draft' check(state in ('draft','published','withdrawn')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  changed_at timestamptz not null default now(),
  revision integer not null default 1 check(revision>0),
  check((state='draft')=(published_at is null))
);
alter table app.school_news enable row level security;

create table app.school_event (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references app.account,
  author_persona app.persona not null check(author_persona in ('admin','teacher')),
  class_id uuid references app.school_class,
  source_locale text not null check(source_locale in ('ar','de')),
  copy jsonb not null check(app.valid_school_copy(source_locale,copy)),
  state text not null default 'draft' check(state in ('draft','published','withdrawn')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  changed_at timestamptz not null default now(),
  revision integer not null default 1 check(revision>0),
  check((state='draft')=(published_at is null)),
  starts_local timestamp not null,
  ends_local timestamp,
  timezone text not null,
  all_day boolean not null,
  check (ends_local is null or ends_local>starts_local),
  check (not all_day or starts_local=starts_local::date::timestamp and
    (ends_local is null or ends_local=ends_local::date::timestamp))
);
alter table app.school_event enable row level security;
create index school_news_audience_idx on app.school_news(class_id,published_at desc,id) where state='published';
create index school_news_author_idx on app.school_news(author_id,changed_at desc,id);
create index school_event_month_idx on app.school_event(starts_local,class_id,id) where state='published';
create index school_event_author_idx on app.school_event(author_id,starts_local,id);

create function app.publishing_class_read(target uuid) returns boolean
language sql stable security definer set search_path=pg_catalog
as $$
  select exists(
    select 1 from app.school_class c
    cross join lateral(select app.school_today() as on_day) t
    where c.id=target and (
      app.has_capability('comms.publish') or app.has_capability('school.manage') or app.has_capability('academics.supervise')
      or app.actor_persona()='teacher' and exists(
        select 1 from app.staff_profile s join app.teaching_assignment a on a.class_id=c.id
        where s.account_id=app.actor_account() and app.profile_active_at(s,t.on_day) and app.teacher_applies(a.id,s.id,t.on_day)
      )
      or app.actor_persona()='guardian' and exists(
        select 1 from app.enrollment e join app.student s on s.id=e.student_id and s.state='active'
        where e.class_id=c.id and e.voided_at is null and t.on_day>=e.effective_from and t.on_day<e.effective_until
          and app.has_child_link(e.student_id)
      )
    )
  )
$$;

create function app.publishing_class_write(target uuid) returns boolean
language sql stable security definer set search_path=pg_catalog
as $$
  select case
    when target is null then app.has_capability('comms.publish')
    else exists(select 1 from app.school_class c where c.id=target and (
      app.has_capability('comms.publish') or app.teacher_scope(c.id,app.school_today(),'comms.class')))
  end
$$;
create function app.publishing_can_edit(author uuid,role_key text,target_class uuid) returns boolean
language sql stable security definer set search_path=pg_catalog
as $$
  select app.publishing_class_write(target_class) and
    (app.has_capability('comms.publish') or (author=app.actor_account() and role_key=app.actor_persona()::text))
$$;

create function app.publishing_class_options()
returns table(id uuid,code text,name_ar text,name_de text,can_write boolean)
language sql stable security definer set search_path=pg_catalog
as $$
  select c.id,c.code,c.name_ar,c.name_de,app.publishing_class_write(c.id)
  from app.school_class c join app.school_year y on y.id=c.year_id
  where y.state='active' and app.school_today()>=y.starts_on and app.school_today()<y.ends_exclusive and app.publishing_class_read(c.id)
$$;

create function app.school_publishing_calendar()
returns table(school_date date,timezone text,school_wide boolean)
language sql stable security definer set search_path=pg_catalog
as $$
  select app.school_today(),coalesce((select s.timezone from app.school_settings s where s.singleton),'Europe/Berlin'),
    app.publishing_class_write(null)
$$;

create function app.school_publishing_rows(kind text,scope text,target uuid,class_filter uuid,month_start date)
returns table(id uuid,class_id uuid,class_ar text,class_de text,source_locale text,copy jsonb,state text,
  published_at timestamptz,changed_at timestamptz,revision integer,can_edit boolean,sort_at timestamptz,
  starts_local timestamp,ends_local timestamp,timezone text,all_day boolean)
language sql stable security definer set search_path=pg_catalog
as $$
  with source as (
    select n.id,n.author_id,n.author_persona,n.class_id,n.source_locale,n.copy,n.state,n.published_at,n.changed_at,n.revision,
      coalesce(n.published_at,n.changed_at) as sort_at,null::timestamp as starts_local,null::timestamp as ends_local,
      null::text as timezone,null::boolean as all_day
    from app.school_news n where kind='news' and (target is null or n.id=target) and (class_filter is null or n.class_id=class_filter)
    union all
    select e.id,e.author_id,e.author_persona,e.class_id,e.source_locale,e.copy,e.state,e.published_at,e.changed_at,e.revision,
      e.starts_local at time zone 'UTC',e.starts_local,e.ends_local,e.timezone,e.all_day
    from app.school_event e where kind='event' and (target is null or e.id=target) and (class_filter is null or e.class_id=class_filter)
      and (month_start is null or (
        e.starts_local<month_start+interval '1 month' and
        (e.starts_local>=month_start or coalesce(e.ends_local,case when e.all_day then e.starts_local+interval '1 day' end)>month_start)
      ))
  )
  select x.id,x.class_id,c.name_ar,c.name_de,x.source_locale,x.copy,x.state,x.published_at,x.changed_at,x.revision,
    permitted.can_edit,x.sort_at,x.starts_local,x.ends_local,x.timezone,x.all_day
  from source x left join app.school_class c on c.id=x.class_id
  cross join lateral (select app.publishing_can_edit(x.author_id,x.author_persona::text,x.class_id) as can_edit) permitted
  where (scope in ('managed','detail') and permitted.can_edit) or
    (scope in ('feed','detail') and x.state='published' and (x.class_id is null or app.publishing_class_read(x.class_id)))
$$;

create function app.write_school_publication(
  kind text,target uuid,expected integer,operation text,class_ref uuid,language_key text,copies jsonb,
  starts timestamp,ends timestamp,whole_day boolean
) returns table(id uuid,revision integer)
language plpgsql security definer set search_path=pg_catalog
as $$
declare prior record;
declare timezone_key text;
declare assigned_id uuid;
declare assigned_revision integer;
declare next_state text;
declare instant timestamptz;
begin
  if kind not in ('news','event') or operation not in ('save','publish','withdraw') then
    raise exception 'Unknown publishing operation' using errcode='23514';
  end if;
  if target is not null then
    if kind='news' then
      select n.author_id,n.author_persona,n.class_id,n.revision,n.state,n.published_at,
        null::timestamp as starts_local,null::timestamp as ends_local,null::text as timezone,null::boolean as all_day
      into prior from app.school_news n where n.id=target for update;
    else
      select e.author_id,e.author_persona,e.class_id,e.revision,e.state,e.published_at,e.starts_local,e.ends_local,e.timezone,e.all_day
      into prior from app.school_event e where e.id=target for update;
    end if;
    if not found or not app.publishing_can_edit(prior.author_id,prior.author_persona::text,prior.class_id) then
      raise exception 'Publication unavailable' using errcode='42501';
    end if;
    if prior.revision<>expected then return; end if;
  end if;

  if operation='save' then
    if not app.publishing_class_write(class_ref) then raise exception 'Audience unavailable' using errcode='42501'; end if;
    if not app.valid_school_copy(language_key,copies) then raise exception 'Invalid localized copy' using errcode='23514'; end if;
    if kind='event' then
      if starts is null or whole_day is null or (ends is not null and ends<=starts) or
        (whole_day and (starts<>starts::date::timestamp or ends is not null and ends<>ends::date::timestamp))
      then raise exception 'Invalid local event time' using errcode='23514'; end if;
      select c.timezone into timezone_key from app.school_publishing_calendar() c;
      if target is not null and (prior.starts_local,prior.ends_local,prior.all_day) is not distinct from (starts,ends,whole_day)
      then timezone_key:=prior.timezone; end if;
      if not whole_day and (((starts at time zone timezone_key) at time zone timezone_key)<>starts or
        (ends is not null and ((ends at time zone timezone_key) at time zone timezone_key)<>ends))
      then raise exception 'The time does not exist in the school timezone' using errcode='23514'; end if;
    end if;

    if target is null and kind='news' then
      insert into app.school_news as n(author_id,author_persona,class_id,source_locale,copy)
      values(app.actor_account(),app.actor_persona(),class_ref,language_key,copies) returning n.id,n.revision into assigned_id,assigned_revision;
    elsif target is null then
      insert into app.school_event as e(author_id,author_persona,class_id,source_locale,copy,starts_local,ends_local,timezone,all_day)
      values(app.actor_account(),app.actor_persona(),class_ref,language_key,copies,starts,ends,timezone_key,whole_day)
      returning e.id,e.revision into assigned_id,assigned_revision;
    elsif kind='news' then
      update app.school_news n set class_id=class_ref,source_locale=language_key,copy=copies,changed_at=now(),revision=n.revision+1
      where n.id=target returning n.id,n.revision into assigned_id,assigned_revision;
    else
      update app.school_event e set class_id=class_ref,source_locale=language_key,copy=copies,starts_local=starts,ends_local=ends,
        timezone=timezone_key,all_day=whole_day,changed_at=now(),revision=e.revision+1
      where e.id=target returning e.id,e.revision into assigned_id,assigned_revision;
    end if;
  else
    if target is null or (operation='publish' and prior.state not in ('draft','withdrawn'))
      or (operation='withdraw' and prior.state<>'published')
    then raise exception 'Publication state has changed' using errcode='23P01'; end if;
    next_state:=case when operation='publish' then 'published' else 'withdrawn' end;
    instant:=case when operation='publish' then now() else prior.published_at end;
    if kind='news' then
      update app.school_news n set state=next_state,published_at=instant,changed_at=now(),revision=n.revision+1
      where n.id=target returning n.id,n.revision into assigned_id,assigned_revision;
    else
      update app.school_event e set state=next_state,published_at=instant,changed_at=now(),revision=e.revision+1
      where e.id=target returning e.id,e.revision into assigned_id,assigned_revision;
    end if;
  end if;
  return query select assigned_id,assigned_revision;
end
$$;

insert into app.audit_action_rule(action,resource_kind,change_category,allowed_capabilities,link_kind)
select action,'communications',category,array['comms.publish'],null from (values
  ('comms.news_saved','update'),('comms.news_published','publication'),('comms.news_withdrawn','withdrawal'),
  ('comms.event_saved','update'),('comms.event_published','publication'),('comms.event_withdrawn','withdrawal')
) entries(action,category);

revoke all on function app.valid_school_copy(text,jsonb),app.publishing_class_read(uuid),app.publishing_class_write(uuid),
  app.publishing_can_edit(uuid,text,uuid),app.publishing_class_options(),app.school_publishing_calendar(),
  app.school_publishing_rows(text,text,uuid,uuid,date),
  app.write_school_publication(text,uuid,integer,text,uuid,text,jsonb,timestamp,timestamp,boolean)
from public,anon,authenticated,service_role;
grant execute on function app.publishing_class_read(uuid),app.publishing_class_write(uuid),app.publishing_class_options(),
  app.school_publishing_calendar(),app.school_publishing_rows(text,text,uuid,uuid,date),
  app.write_school_publication(text,uuid,integer,text,uuid,text,jsonb,timestamp,timestamp,boolean)
to app_runtime;
