insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
  ('madrasty-chat-photo-staging','madrasty-chat-photo-staging',false,10485760,array['image/jpeg']),
  ('madrasty-chat-voice-staging','madrasty-chat-voice-staging',false,8388608,array['audio/wav']),
  ('madrasty-chat-media','madrasty-chat-media',false,10485760,array['image/jpeg','audio/wav'])
on conflict(id) do nothing;

do $$
begin
  if exists(select 1 from (values
      ('madrasty-chat-photo-staging',10485760,array['image/jpeg']),
      ('madrasty-chat-voice-staging',8388608,array['audio/wav']),
      ('madrasty-chat-media',10485760,array['image/jpeg','audio/wav'])
    ) wanted(id,maximum,mime) left join storage.buckets b on b.id=wanted.id
    where b.id is null or b.public or b.file_size_limit is distinct from wanted.maximum::bigint
      or b.allowed_mime_types is distinct from wanted.mime)
  then raise exception 'Madrasty chat media buckets have incompatible limits or visibility'; end if;
end
$$;

create table app.chat_upload (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references app.thread,
  uploader_id uuid not null references app.account,
  uploader_persona text not null check(uploader_persona in ('admin','teacher','guardian')),
  request_key text not null check(request_key ~ '^[A-Za-z0-9._~-]{1,128}$'),
  finalize_key text check(finalize_key ~ '^[A-Za-z0-9._~-]{1,128}$'),
  media_kind text not null check(media_kind in ('photo','voice')),
  declared_bytes integer not null,
  state text not null default 'staged' check(state in ('staged','processing','ready','failed','cancelled')),
  expires_at timestamptz not null,
  attach_until timestamptz,
  lease_id uuid,
  lease_until timestamptz,
  raw_cleaned_at timestamptz,
  media_cleaned_at timestamptz,
  cleanup_id uuid,
  cleanup_until timestamptz,
  unique(thread_id,uploader_id,uploader_persona,request_key),
  unique(uploader_id,uploader_persona,finalize_key),
  check((media_kind='photo' and declared_bytes between 1 and 10485760)
    or (media_kind='voice' and declared_bytes between 46 and 8388608))
);
create index chat_upload_cleanup_idx on app.chat_upload(expires_at,id) where raw_cleaned_at is null or media_cleaned_at is null;

create table app.chat_media (
  id uuid primary key references app.chat_upload,
  media_kind text not null check(media_kind in ('photo','voice')),
  bytes integer not null check(bytes between 1 and 10485760),
  duration_ms integer,
  created_at timestamptz not null default now(),
  check((media_kind='photo' and duration_ms is null)
    or (media_kind='voice' and bytes<=8388608 and duration_ms is not null and duration_ms between 1 and 180000))
);
alter table app.thread_message_attachment add constraint chat_attachment_media_fk foreign key(media_id) references app.chat_media;
alter table app.chat_upload enable row level security;
alter table app.chat_media enable row level security;

create function app.issue_chat_upload(target uuid,upload_key text,kind_key text,expected_bytes integer)
returns table(upload_id uuid,valid_until timestamptz)
language plpgsql security definer set search_path=pg_catalog
as $$
declare entry app.chat_upload%rowtype;
declare actor uuid:=app.actor_account();
declare persona_key text:=app.actor_persona()::text;
begin
  if not app.thread_can_reply(target) then raise exception 'Thread is unavailable for upload' using errcode='42501'; end if;
  insert into app.chat_upload as u(thread_id,uploader_id,uploader_persona,request_key,media_kind,declared_bytes,expires_at)
    values(target,actor,persona_key,upload_key,kind_key,expected_bytes,now()+interval '125 minutes')
    on conflict(thread_id,uploader_id,uploader_persona,request_key) do nothing returning * into entry;
  if not found then
    select u.* into entry from app.chat_upload u where u.thread_id=target and u.uploader_id=actor
      and u.uploader_persona=persona_key and u.request_key=upload_key for update;
    if (entry.media_kind,entry.declared_bytes) is distinct from (kind_key,expected_bytes) then
      raise exception 'Upload request has changed' using errcode='23505';
    end if;
    if entry.state<>'staged' or entry.expires_at<=now() or entry.cleanup_id is not null then
      raise exception 'Upload authority has expired or the file is already submitted' using errcode='23P01';
    end if;
    update app.chat_upload u set expires_at=now()+interval '125 minutes'
      where u.id=entry.id returning * into entry;
  end if;
  return query select entry.id,entry.expires_at-interval '5 minutes';
end
$$;

create function app.claim_chat_upload(target_thread uuid,target_upload uuid,command_key text)
returns table(outcome text,kind text,declared_bytes integer,lease uuid)
language plpgsql security definer set search_path=pg_catalog
as $$
declare entry app.chat_upload%rowtype;
declare chosen uuid;
begin
  if not app.thread_can_reply(target_thread) then raise exception 'Thread is unavailable for upload' using errcode='42501'; end if;
  select u.* into entry from app.chat_upload u where u.id=target_upload and u.thread_id=target_thread
    and u.uploader_id=app.actor_account() and u.uploader_persona=app.actor_persona()::text for update;
  if not found then raise exception 'Upload is unavailable' using errcode='42501'; end if;
  if entry.finalize_key is null then
    update app.chat_upload u set finalize_key=command_key where u.id=target_upload;
  elsif entry.finalize_key<>command_key then
    raise exception 'Upload finalization key has changed' using errcode='23505';
  end if;
  if entry.state in ('ready','failed','cancelled') or (entry.state='processing' and entry.lease_until>now()) then
    return query select entry.state,entry.media_kind,entry.declared_bytes,null::uuid;
    return;
  end if;
  if entry.expires_at<=now() then
    update app.chat_upload u set state='cancelled',lease_id=null,lease_until=null where u.id=target_upload;
    return query select 'cancelled'::text,entry.media_kind,entry.declared_bytes,null::uuid;
    return;
  end if;
  chosen:=gen_random_uuid();
  update app.chat_upload u set state='processing',lease_id=chosen,lease_until=now()+interval '90 seconds' where u.id=target_upload;
  return query select 'processing'::text,entry.media_kind,entry.declared_bytes,chosen;
end
$$;

create function app.finish_chat_upload(target_thread uuid,target_upload uuid,lease uuid,ended text,result_bytes integer,result_duration integer)
returns text language plpgsql security definer set search_path=pg_catalog
as $$
declare entry app.chat_upload%rowtype;
begin
  if not app.thread_can_reply(target_thread) then raise exception 'Thread is unavailable for upload' using errcode='42501'; end if;
  select u.* into entry from app.chat_upload u where u.id=target_upload and u.thread_id=target_thread
    and u.uploader_id=app.actor_account() and u.uploader_persona=app.actor_persona()::text for update;
  if not found then raise exception 'Upload is unavailable' using errcode='42501'; end if;
  if entry.state<>'processing' or entry.lease_id is distinct from lease or entry.lease_until<=now() then return entry.state; end if;
  if ended not in ('staged','failed','ready') then raise exception 'Invalid upload state' using errcode='23514'; end if;
  if ended='ready' then
    insert into app.chat_media(id,media_kind,bytes,duration_ms) values(target_upload,entry.media_kind,result_bytes,result_duration);
  end if;
  update app.chat_upload u set state=ended,lease_id=null,lease_until=null,
    attach_until=case when ended='ready' then now()+interval '24 hours' end
  where u.id=target_upload;
  return ended;
end
$$;

create function app.cancel_chat_upload(target_thread uuid,target_upload uuid)
returns text language plpgsql security definer set search_path=pg_catalog
as $$
declare entry app.chat_upload%rowtype;
begin
  if not app.thread_can_access(target_thread) then raise exception 'Thread is unavailable' using errcode='42501'; end if;
  select u.* into entry from app.chat_upload u where u.id=target_upload and u.thread_id=target_thread
    and u.uploader_id=app.actor_account() and u.uploader_persona=app.actor_persona()::text for update;
  if not found then raise exception 'Upload is unavailable' using errcode='42501'; end if;
  if exists(select 1 from app.thread_message_attachment m where m.media_id=target_upload) then return 'ready'; end if;
  update app.chat_upload u set state='cancelled',attach_until=null where u.id=target_upload;
  return 'cancelled';
end
$$;

create or replace function app.bind_chat_media(target_thread uuid,target_message uuid,attachments uuid[])
returns boolean language plpgsql security definer set search_path=pg_catalog
as $$
declare item record;
declare bound integer:=0;
begin
  if coalesce(cardinality(attachments),0)=0 then return true; end if;
  if cardinality(attachments)>4 or not app.thread_can_reply(target_thread) then return false; end if;
  for item in select u.id from app.chat_upload u join app.chat_media media on media.id=u.id
    where u.id=any(attachments) and u.thread_id=target_thread and u.state='ready' and u.attach_until>now()
      and u.uploader_id=app.actor_account() and u.uploader_persona=app.actor_persona()::text
      and not exists(select 1 from app.thread_message_attachment m where m.media_id=u.id)
    order by u.id for update of u
  loop bound:=bound+1; end loop;
  if bound<>cardinality(attachments) then return false; end if;
  insert into app.thread_message_attachment(message_id,media_id,ordinal)
    select target_message,asset,rank::integer from unnest(attachments) with ordinality as file(asset,rank);
  return true;
end
$$;

alter table app.thread_message add column redacted_at timestamptz;

create or replace function app.chat_media_descriptors(target_message uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'kind',m.media_kind,
    'contentType',case when m.media_kind='photo' then 'image/jpeg' else 'audio/wav' end,
    'bytes',m.bytes,'durationMs',m.duration_ms) order by link.ordinal),'[]'::jsonb)
  from app.thread_message_attachment link join app.chat_media m on m.id=link.media_id
  where link.message_id=target_message
$$;

create function app.thread_media_object(target_thread uuid,target_media uuid)
returns table(kind text,bytes integer)
language sql stable security definer set search_path=pg_catalog
as $$
  select a.media_kind,a.bytes from app.chat_media a join app.thread_message_attachment l on l.media_id=a.id
  join app.thread_message m on m.id=l.message_id and m.thread_id=target_thread and m.redacted_at is null
  where a.id=target_media and app.thread_can_access(m.thread_id)
$$;

create function app.claim_expired_chat_uploads(batch_size integer)
returns table(upload_id uuid,kind text,lease uuid,delete_raw boolean,delete_ready boolean)
language plpgsql security definer set search_path=pg_catalog
as $$
declare u record;
declare token uuid;
begin
  for u in select entry.id,entry.media_kind,entry.raw_cleaned_at is null as raw,
    entry.media_cleaned_at is null and not exists(select 1 from app.thread_message_attachment l where l.media_id=entry.id)
      and (entry.state<>'ready' or entry.attach_until is null or entry.attach_until<=now()) as media
    from app.chat_upload entry where entry.expires_at<=now()
      and (entry.lease_until is null or entry.lease_until<=now())
      and (entry.cleanup_until is null or entry.cleanup_until<=now())
      and (entry.raw_cleaned_at is null or (entry.media_cleaned_at is null
        and not exists(select 1 from app.thread_message_attachment l where l.media_id=entry.id)
        and (entry.state<>'ready' or entry.attach_until is null or entry.attach_until<=now())))
    order by entry.expires_at,entry.id limit least(greatest(batch_size,1),40) for update skip locked
  loop
    token:=gen_random_uuid();
    update app.chat_upload entry set cleanup_id=token,cleanup_until=now()+interval '5 minutes',
      state=case when u.media then 'cancelled' else entry.state end
    where entry.id=u.id;
    return query select u.id,u.media_kind,token,u.raw,u.media;
  end loop;
end
$$;
create function app.finish_chat_cleanup(target uuid,lease uuid,raw_done boolean,ready_done boolean)
returns void language sql security definer set search_path=pg_catalog
as $$
  update app.chat_upload u set
    raw_cleaned_at=case when raw_done then now() else u.raw_cleaned_at end,
    media_cleaned_at=case when ready_done then now() else u.media_cleaned_at end,
    cleanup_id=null,cleanup_until=null
  where u.id=target and u.cleanup_id=lease and (raw_done or ready_done)
$$;

create table app.chat_moderator (
  account_id uuid primary key references app.account,
  authorized_by uuid not null references app.account,
  active_from timestamptz not null default now(),
  revoked_at timestamptz
);
alter table app.chat_moderator enable row level security;

create table app.chat_message_report (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null,
  message_id uuid not null,
  reporter_id uuid not null references app.account,
  reporter_persona text not null check(reporter_persona in ('admin','teacher','guardian')),
  reviewer_id uuid references app.account,
  reason text not null check(char_length(btrim(reason)) between 1 and 500),
  state text not null default 'pending' check(state in ('pending','in_review','resolved','dismissed')),
  action text check(action in ('none','redact')),
  revision integer not null default 1 check(revision>=1),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique(message_id,reporter_id,reporter_persona),
  foreign key(thread_id,message_id) references app.thread_message(thread_id,id),
  check((state in ('resolved','dismissed'))=(decided_at is not null)),
  check(action is null or state in ('resolved','dismissed'))
);
create index message_report_review_idx on app.chat_message_report(reviewer_id,state,created_at desc,id);
alter table app.chat_message_report enable row level security;

create function app.chat_moderator_active(target uuid)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
  select app.contact_account_active(target,'admin') and exists(
    select 1 from app.chat_moderator g where g.account_id=target and g.active_from<=now() and g.revoked_at is null
  )
$$;

create function app.can_manage_chat_reports()
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
  select coalesce(app.actor_persona()='admin' and current_setting('app.assurance',true)='aal2'
    and app.chat_moderator_active(app.actor_account()),false)
$$;

create function app.can_review_chat_report(target uuid)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
  select app.can_manage_chat_reports() and exists(select 1 from app.chat_message_report r
    where r.id=target and r.reviewer_id=app.actor_account())
$$;

create function app.pick_report_reviewer(reporter uuid,target_thread uuid)
returns uuid language sql stable security definer set search_path=pg_catalog
as $$
  select r.account_id from app.chat_moderator r where r.account_id<>reporter and app.chat_moderator_active(r.account_id)
    and not exists(select 1 from app.thread_participant p where p.thread_id=target_thread and p.account_id=r.account_id)
  order by (select count(*) from app.chat_message_report q where q.reviewer_id=r.account_id and q.state in ('pending','in_review')),r.account_id
  limit 1
$$;
create function app.reassign_pending_chat_reports(maximum integer)
returns void language sql security definer set search_path=pg_catalog
as $$
  with pending as (
    select r.id,r.reporter_id,r.thread_id from app.chat_message_report r
    where r.state in ('pending','in_review') and not app.chat_moderator_active(r.reviewer_id)
    order by r.created_at,r.id limit least(greatest(maximum,1),40) for update skip locked
  ), replacement as (
    select p.id,app.pick_report_reviewer(p.reporter_id,p.thread_id) as reviewer from pending p
  )
  update app.chat_message_report r set reviewer_id=c.reviewer,state='pending',revision=r.revision+1
  from replacement c where c.id=r.id and r.reviewer_id is distinct from c.reviewer
$$;

create function app.file_chat_report(target_thread uuid,target_message uuid,explanation text)
returns table(report_id uuid,inserted boolean)
language plpgsql security definer set search_path=pg_catalog
as $$
declare actor uuid:=app.actor_account();
declare persona_key text:=app.actor_persona()::text;
declare created uuid;
begin
  if not app.thread_can_access(target_thread) or not exists(
    select 1 from app.thread_message m where m.id=target_message and m.thread_id=target_thread and m.redacted_at is null
  ) then raise exception 'Message is unavailable' using errcode='42501'; end if;
  insert into app.chat_message_report as r(thread_id,message_id,reporter_id,reporter_persona,reviewer_id,reason)
    values(target_thread,target_message,actor,persona_key,app.pick_report_reviewer(actor,target_thread),btrim(explanation))
    on conflict(message_id,reporter_id,reporter_persona) do nothing returning r.id into created;
  if found then return query select created,true;return; end if;
  select r.id into created from app.chat_message_report r
    where r.message_id=target_message and r.reporter_id=actor and r.reporter_persona=persona_key;
  return query select created,false;
end
$$;

create function app.chat_report_rows(target uuid)
returns table(id uuid,thread_id uuid,message_id uuid,state text,action text,revision integer,created_at timestamptz,
  reason text,message_body text,author_name text,message_created_at timestamptz,attachments jsonb)
language sql stable security definer set search_path=pg_catalog
as $$
  select r.id,r.thread_id,r.message_id,r.state,r.action,r.revision,r.created_at,r.reason,m.body,
    app.contact_name(m.author_id,m.author_persona),m.created_at,app.chat_media_descriptors(m.id)
  from app.chat_message_report r join app.thread_message m on m.id=r.message_id
  where (target is null or r.id=target) and app.can_review_chat_report(r.id)
$$;

create function app.report_media_object(target_report uuid,target_media uuid)
returns table(kind text,bytes integer)
language sql stable security definer set search_path=pg_catalog
as $$
  select m.media_kind,m.bytes from app.chat_message_report r join app.thread_message_attachment l on l.message_id=r.message_id
  join app.chat_media m on m.id=l.media_id
  where r.id=target_report and m.id=target_media and app.can_review_chat_report(r.id)
$$;

create function app.review_chat_report(target uuid,expected integer,new_state text,new_action text)
returns integer language plpgsql security definer set search_path=pg_catalog
as $$
declare old_report app.chat_message_report%rowtype;
declare next_revision integer;
begin
  if not app.can_review_chat_report(target) then raise exception 'Report is unavailable' using errcode='42501'; end if;
  select r.* into old_report from app.chat_message_report r where r.id=target for update;
  if not found or not app.can_review_chat_report(target) then raise exception 'Report is unavailable' using errcode='42501'; end if;
  if old_report.revision<>expected then return null; end if;
  if old_report.state in ('resolved','dismissed') or new_state not in ('in_review','resolved','dismissed')
    or (new_action='redact' and new_state<>'resolved') or (new_state='in_review' and new_action is not null)
    then raise exception 'Invalid report transition' using errcode='23514'; end if;
  if new_action='redact' then
    update app.thread_message m set redacted_at=coalesce(m.redacted_at,now()),replyable=false where m.id=old_report.message_id;
  end if;
  update app.chat_message_report r set state=new_state,action=case when new_state='in_review' then null else coalesce(new_action,'none') end,
    revision=r.revision+1,decided_at=case when new_state in ('resolved','dismissed') then now() end
  where r.id=target returning r.revision into next_revision;
  return next_revision;
end
$$;

create or replace function app.chat_message_projection(target_thread uuid,target_message uuid,query text)
returns table(id uuid,thread_id uuid,sequence bigint,source text,author_name text,body text,is_own boolean,
  client_id uuid,created_at timestamptz,replyable boolean,reply jsonb,attachments jsonb,reactions jsonb,counterpart_read boolean)
language sql stable security definer set search_path=pg_catalog
as $$
  select m.id,m.thread_id,m.sequence,m.source,app.contact_name(m.author_id,m.author_persona),
    case when m.redacted_at is null then m.body end,
    own.is_mine,case when own.is_mine then m.client_message_id end,m.created_at,m.replyable and m.redacted_at is null,
    case when q.id is not null then jsonb_build_object('id',q.id,'sequence',q.sequence::text,
      'authorName',app.contact_name(q.author_id,q.author_persona),'source',q.source,
      'preview',case when q.redacted_at is null then left(q.body,140) end) end,
    case when m.redacted_at is null then app.chat_media_descriptors(m.id) else '[]'::jsonb end,
    case when m.redacted_at is null then app.chat_reaction_state(m.id) else '[]'::jsonb end,
    case when own.is_mine then app.chat_received_read(m.thread_id,m.author_id,m.author_persona,m.sequence) end
  from app.thread_message m left join app.thread_message q on q.thread_id=m.thread_id and q.id=m.reply_to_id
  cross join lateral (select m.source='human' and m.author_id=app.actor_account() and m.author_persona=app.actor_persona()::text as is_mine) own
  where m.thread_id=target_thread and (target_message is null or m.id=target_message) and app.thread_can_access(m.thread_id)
    and (query is null or m.redacted_at is null and strpos(lower(coalesce(m.body,'')),lower(query))>0)
$$;

create or replace function app.put_chat_reaction(target_thread uuid,target_message uuid,choice text)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare actor uuid:=app.actor_account();
declare actor_role text:=app.actor_persona()::text;
begin
  if not app.thread_can_access(target_thread) then
    raise exception 'Message is unavailable' using errcode='42501';
  end if;
  perform 1 from app.thread_message m
    where m.thread_id=target_thread and m.id=target_message and m.redacted_at is null for share;
  if not found then
    raise exception 'Message is unavailable' using errcode='23514';
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

create or replace function app.chat_recent_activity(target uuid,query text)
returns table(activity_at timestamptz,last_message_at timestamptz,latest_preview text,latest_source text,
  unread integer,archived boolean,read_through bigint,last_sequence bigint)
language sql stable security definer set search_path=pg_catalog
as $$
  select coalesce(t.last_message_at,t.created_at),t.last_message_at,case when m.redacted_at is null then left(m.body,140) end,m.source,
    (select count(*)::int from app.thread_message unread where unread.thread_id=t.id and unread.sequence>p.read_through),
    p.archived,p.read_through,p.last_sequence
  from app.thread t cross join lateral app.thread_private_state(t.id) p
  left join app.thread_message m on m.thread_id=t.id and m.sequence=t.last_sequence
  where t.id=target and (query is null or exists(
    select 1 from app.thread_message f where f.thread_id=t.id and f.redacted_at is null
      and strpos(lower(coalesce(f.body,'')),lower(query))>0
  ))
$$;

revoke all on function app.issue_chat_upload(uuid,text,text,integer),app.claim_chat_upload(uuid,uuid,text),
  app.finish_chat_upload(uuid,uuid,uuid,text,integer,integer),app.cancel_chat_upload(uuid,uuid),app.thread_media_object(uuid,uuid),
  app.claim_expired_chat_uploads(integer),app.finish_chat_cleanup(uuid,uuid,boolean,boolean),app.chat_moderator_active(uuid),
  app.can_manage_chat_reports(),app.can_review_chat_report(uuid),app.pick_report_reviewer(uuid,uuid),app.reassign_pending_chat_reports(integer),app.file_chat_report(uuid,uuid,text),
  app.chat_report_rows(uuid),app.report_media_object(uuid,uuid),app.review_chat_report(uuid,integer,text,text)
from public,anon,authenticated,service_role;
grant execute on function app.issue_chat_upload(uuid,text,text,integer),app.claim_chat_upload(uuid,uuid,text),
  app.finish_chat_upload(uuid,uuid,uuid,text,integer,integer),app.cancel_chat_upload(uuid,uuid),app.thread_media_object(uuid,uuid),
  app.claim_expired_chat_uploads(integer),app.finish_chat_cleanup(uuid,uuid,boolean,boolean),app.reassign_pending_chat_reports(integer),
  app.file_chat_report(uuid,uuid,text),app.can_manage_chat_reports(),app.chat_report_rows(uuid),app.report_media_object(uuid,uuid),app.review_chat_report(uuid,integer,text,text)
to app_runtime;
