create or replace function app.write_school_publication(
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
      -- PL/pgSQL cannot bind fields of an unassigned RECORD even in a conditional expression.
      -- A new event has no prior row. Keep the prior timezone only for existing events.
      if target is not null then
        if (prior.starts_local,prior.ends_local,prior.all_day) is not distinct from (starts,ends,whole_day)
        then timezone_key:=prior.timezone; end if;
      end if;
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
    if target is null then raise exception 'Publication target required' using errcode='23P01'; end if;
    if (operation='publish' and prior.state not in ('draft','withdrawn'))
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

