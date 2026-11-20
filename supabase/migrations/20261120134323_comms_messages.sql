alter table app.thread
  add column last_sequence bigint not null default 0 check(last_sequence>=0),
  add column last_message_at timestamptz;

create table app.thread_message (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references app.thread,
  sequence bigint not null check(sequence>0),
  source text not null check(source in ('human','system')),
  author_id uuid references app.account,
  author_persona text check(author_persona in ('admin','teacher','guardian')),
  client_message_id uuid,
  request_hash text check(request_hash ~ '^[0-9a-f]{64}$'),
  system_event_id uuid unique,
  body text check(char_length(body)<=4000),
  reply_to_id uuid,
  replyable boolean not null default true,
  created_at timestamptz not null default now(),
  unique(thread_id,id),
  unique(thread_id,sequence),
  unique(thread_id,author_id,author_persona,client_message_id),
  foreign key(thread_id,reply_to_id) references app.thread_message(thread_id,id),
  check((source='human' and author_id is not null and author_persona is not null and client_message_id is not null
      and request_hash is not null and system_event_id is null)
    or (source='system' and author_id is null and author_persona is null and client_message_id is null
      and request_hash is null and system_event_id is not null))
);

create table app.thread_message_attachment (
  message_id uuid not null references app.thread_message,
  media_id uuid not null unique,
  ordinal integer not null check(ordinal between 1 and 4),
  primary key(message_id,ordinal)
);

create table app.thread_reader (
  thread_id uuid not null references app.thread,
  account_id uuid not null references app.account,
  persona text not null check(persona in ('admin','teacher','guardian')),
  read_through bigint not null default 0 check(read_through>=0),
  archived boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key(thread_id,account_id,persona)
);
create index thread_reader_inbox ON app.thread_reader(account_id,persona,archived,thread_id);

create table app.message_reaction (
  message_id uuid not null references app.thread_message,
  account_id uuid not null references app.account,
  persona text not null check(persona in ('admin','teacher','guardian')),
  emoji text not null check(emoji in ('👍','❤️','😂','😮','😢','🙏')),
  primary key(message_id,account_id,persona)
);

alter table app.thread_message enable row level security;
alter table app.thread_message_attachment enable row level security;
alter table app.thread_reader enable row level security;
alter table app.message_reaction enable row level security;

-- C03 binds ready, same-thread, same-uploader media and protected playback.
create function app.bind_chat_media(target_thread uuid,target_message uuid,attachments uuid[])
returns boolean language sql security definer set search_path=pg_catalog
as $$ select coalesce(cardinality(attachments),0)=0 $$;
create function app.chat_media_descriptors(target_message uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog
as $$ select '[]'::jsonb $$;

create function app.post_thread_message(
  target uuid,client_id uuid,request_digest text,message_body text,attachment_ids uuid[],reply_id uuid
) returns table(message_id uuid,sequence bigint,inserted boolean)
language plpgsql security definer set search_path=pg_catalog
as $$
declare active_thread app.thread%rowtype;
declare previous app.thread_message%rowtype;
declare saved app.thread_message%rowtype;
declare message_text text:=nullif(btrim(message_body),'');
declare actor uuid:=app.actor_account();
declare actor_role text:=app.actor_persona()::text;
declare issued_sequence bigint;
begin
  if not app.thread_can_access(target) then raise exception 'Conversation is unavailable' using errcode='42501'; end if;
  select t.* into active_thread from app.thread t where t.id=target for update;
  if not found or not app.thread_can_access(target) then raise exception 'Conversation is unavailable' using errcode='42501'; end if;
  if not app.thread_can_reply(target) then raise exception 'Conversation is closed for messages' using errcode='23P01'; end if;
  select m.* into previous from app.thread_message m where m.thread_id=target and m.author_id=actor
    and m.author_persona=actor_role and m.client_message_id=client_id;
  if found then
    if previous.request_hash<>request_digest then raise exception 'Message retry has a different payload' using errcode='23505'; end if;
    return query select previous.id,previous.sequence,false;
    return;
  end if;
  if coalesce(char_length(message_text),0)>4000 or coalesce(cardinality(attachment_ids),0)>4 or
    (message_text is null and coalesce(cardinality(attachment_ids),0)=0) then
    raise exception 'A valid message or attachment is required' using errcode='23514';
  end if;
  if reply_id is not null and not exists(
    select 1 from app.thread_message m where m.thread_id=target and m.id=reply_id and m.replyable
  ) then raise exception 'Quoted message is unavailable' using errcode='23514'; end if;

  issued_sequence:=active_thread.last_sequence+1;
  insert into app.thread_message(thread_id,sequence,source,author_id,author_persona,client_message_id,request_hash,body,reply_to_id)
    values(target,issued_sequence,'human',actor,actor_role,client_id,request_digest,message_text,reply_id)
    returning * into saved;
  if not app.bind_chat_media(target,saved.id,attachment_ids) then
    raise exception 'Message attachment is unavailable' using errcode='23514';
  end if;
  update app.thread as t set last_sequence=issued_sequence,last_message_at=saved.created_at where t.id=target;
  update app.thread_reader p set archived=false,updated_at=now() where p.thread_id=target and p.archived;
  insert into app.thread_reader as r(thread_id,account_id,persona,read_through,archived)
    values(target,actor,actor_role,issued_sequence,false)
    on conflict(thread_id,account_id,persona) do update set
      read_through=greatest(r.read_through,excluded.read_through),archived=false,updated_at=now();
  return query select saved.id,saved.sequence,true;
end
$$;

create function app.thread_private_state(target uuid)
returns table(read_through bigint,archived boolean,last_sequence bigint)
language sql stable security definer set search_path=pg_catalog
as $$
  select coalesce(r.read_through,0),coalesce(r.archived,false),t.last_sequence from app.thread t
  left join app.thread_reader r on r.thread_id=t.id and r.account_id=app.actor_account() and r.persona=app.actor_persona()::text
  where t.id=target and app.thread_can_access(t.id)
$$;

create function app.change_thread_reader(target uuid,high_water bigint,archive_value boolean)
returns table(read_through bigint,archived boolean,last_sequence bigint)
language plpgsql security definer set search_path=pg_catalog
as $$
declare highest bigint;
declare actor uuid:=app.actor_account();
declare actor_role text:=app.actor_persona()::text;
begin
  if not app.thread_can_access(target) then raise exception 'Conversation is unavailable' using errcode='42501'; end if;
  select t.last_sequence into highest from app.thread t where t.id=target for update;
  if not found or not app.thread_can_access(target) then raise exception 'Conversation is unavailable' using errcode='42501'; end if;
  if high_water<0 then raise exception 'Invalid read cursor' using errcode='23514'; end if;
  return query insert into app.thread_reader as r(thread_id,account_id,persona,read_through,archived)
    values(target,actor,actor_role,least(coalesce(high_water,0),highest),coalesce(archive_value,false))
    on conflict(thread_id,account_id,persona) do update set read_through=greatest(r.read_through,excluded.read_through),
      archived=coalesce(archive_value,r.archived),updated_at=now()
    returning r.read_through,r.archived,highest;
end
$$;

create function app.chat_recent_activity(target uuid,query text)
returns table(activity_at timestamptz,last_message_at timestamptz,latest_preview text,latest_source text,
  unread integer,archived boolean,read_through bigint,last_sequence bigint)
language sql stable security definer set search_path=pg_catalog
as $$
  select coalesce(t.last_message_at,t.created_at),t.last_message_at,left(m.body,140),m.source,
    (select count(*)::int from app.thread_message unread where unread.thread_id=t.id and unread.sequence>p.read_through),
    p.archived,p.read_through,p.last_sequence
  from app.thread t cross join lateral app.thread_private_state(t.id) p
  left join app.thread_message m on m.thread_id=t.id and m.sequence=t.last_sequence
  where t.id=target and (query is null or strpos(lower(coalesce(m.body,'')),lower(query))>0 or exists(
    select 1 from app.thread_message f where f.thread_id=t.id and strpos(lower(coalesce(f.body,'')),lower(query))>0
  ))
$$;

create function app.chat_received_read(target uuid,sender uuid,sender_role text,seen_sequence bigint)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
  select exists(
    select 1 from app.thread t join app.thread_reader r on r.thread_id=t.id
    left join app.office_case c on c.thread_id=t.id
    where t.id=target and (r.account_id,r.persona)<>(sender,sender_role) and r.read_through>=seen_sequence
      and (
        (t.kind='direct' and exists(select 1 from app.thread_participant p where p.thread_id=t.id and p.account_id=r.account_id and p.persona=r.persona))
        or (t.kind='office' and (
          (c.requester_id=sender and c.requester_persona=sender_role and r.persona='admin' and app.office_delegate_active(c.inbox,r.account_id))
          or ((c.requester_id,c.requester_persona)<>(sender,sender_role) and r.account_id=c.requester_id and r.persona=c.requester_persona)
        ))
      )
  )
$$;

create function app.chat_reaction_state(target_message uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog
as $$
  select coalesce(jsonb_agg(jsonb_build_object('emoji',r.emoji,'count',r.count,'mine',r.mine) order by r.emoji),'[]'::jsonb)
  from (
    select m.emoji,count(*)::int as count,bool_or(m.account_id=app.actor_account() and m.persona=app.actor_persona()::text) as mine
    from app.message_reaction m where m.message_id=target_message group by m.emoji
  ) r
$$;

create function app.chat_message_projection(target_thread uuid,target_message uuid,query text)
returns table(id uuid,thread_id uuid,sequence bigint,source text,author_name text,body text,is_own boolean,
  client_id uuid,created_at timestamptz,replyable boolean,reply jsonb,attachments jsonb,reactions jsonb,counterpart_read boolean)
language sql stable security definer set search_path=pg_catalog
as $$
  select m.id,m.thread_id,m.sequence,m.source,app.contact_name(m.author_id,m.author_persona),m.body,
    own.is_mine,case when own.is_mine then m.client_message_id end,m.created_at,m.replyable,
    case when q.id is not null then jsonb_build_object('id',q.id,'sequence',q.sequence::text,
      'authorName',app.contact_name(q.author_id,q.author_persona),'source',q.source,'preview',left(q.body,140)) end,
    app.chat_media_descriptors(m.id),app.chat_reaction_state(m.id),
    case when own.is_mine then app.chat_received_read(m.thread_id,m.author_id,m.author_persona,m.sequence) end
  from app.thread_message m left join app.thread_message q on q.thread_id=m.thread_id and q.id=m.reply_to_id
  cross join lateral (select m.source='human' and m.author_id=app.actor_account() and m.author_persona=app.actor_persona()::text as is_mine) own
  where m.thread_id=target_thread and (target_message is null or m.id=target_message) and app.thread_can_access(m.thread_id)
    and (query is null or strpos(lower(coalesce(m.body,'')),lower(query))>0)
$$;

create function app.put_chat_reaction(target_thread uuid,target_message uuid,choice text)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare actor uuid:=app.actor_account();
declare actor_role text:=app.actor_persona()::text;
begin
  if not app.thread_can_access(target_thread) or not exists(select 1 from app.thread_message m where m.thread_id=target_thread and m.id=target_message) then
    raise exception 'Message is unavailable' using errcode='42501';
  end if;
  if choice is null then
    delete from app.message_reaction r where r.message_id=target_message and r.account_id=actor and r.persona=actor_role;
  else
    insert into app.message_reaction(message_id,account_id,persona,emoji) values(target_message,actor,actor_role,choice)
      on conflict(message_id,account_id,persona) do update set emoji=excluded.emoji;
  end if;
  return app.chat_reaction_state(target_message);
end
$$;

create or replace function app.change_office_case(target uuid,expected integer,new_status text,new_assignee uuid,change_assignee boolean)
returns integer language plpgsql security definer set search_path=pg_catalog
as $$
declare previous app.office_case%rowtype;
declare thread_ref uuid;
declare changed_revision integer;
begin
  select c.thread_id into thread_ref from app.office_case c where c.id=target and app.has_inbox(c.inbox);
  if not found then raise exception 'Office case is unavailable' using errcode='42501'; end if;
  perform 1 from app.thread t where t.id=thread_ref for update;
  select c.* into previous from app.office_case c where c.id=target for update;
  if not found or not (app.has_inbox(previous.inbox) and app.office_delegate_active(previous.inbox,app.actor_account()))
    then raise exception 'Office case is unavailable' using errcode='42501'; end if;
  if previous.revision<>expected then return null; end if;
  if change_assignee and new_assignee is not null and not app.office_delegate_active(previous.inbox,new_assignee) then
    raise exception 'Assignee is outside the office delegation' using errcode='23514';
  end if;
  update app.office_case c set status=coalesce(new_status,c.status),revision=c.revision+1,updated_at=now(),
    assignee_id=case when change_assignee then new_assignee else c.assignee_id end
    where c.id=target returning c.revision into changed_revision;
  return changed_revision;
end
$$;

revoke all on function app.bind_chat_media(uuid,uuid,uuid[]),app.chat_media_descriptors(uuid),app.post_thread_message(uuid,uuid,text,text,uuid[],uuid),
  app.thread_private_state(uuid),app.change_thread_reader(uuid,bigint,boolean),app.chat_recent_activity(uuid,text),
  app.chat_received_read(uuid,uuid,text,bigint),app.chat_reaction_state(uuid),app.chat_message_projection(uuid,uuid,text),
  app.put_chat_reaction(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function app.post_thread_message(uuid,uuid,text,text,uuid[],uuid),app.thread_private_state(uuid),
  app.change_thread_reader(uuid,bigint,boolean),app.chat_recent_activity(uuid,text),app.chat_message_projection(uuid,uuid,text),
  app.put_chat_reaction(uuid,uuid,text) to app_runtime;
