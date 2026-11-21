create role app_delivery_worker nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant usage on schema app to app_delivery_worker;

create table app.delivery_job (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references app.outbox_event,
  logical_key text not null check(char_length(logical_key) between 1 and 220),
  recipient_key uuid not null,
  recipient_id uuid references app.account,
  recipient_persona text check(recipient_persona in ('admin','teacher','guardian','applicant')),
  notice_id uuid references app.notification,
  channel text not null check(channel in ('email','push')),
  kind text not null check(kind in ('invite_guardian','invite_teacher','broadcast','chat_reminder','attendance','academics','finance','school')),
  scope_id uuid not null,
  source_revision integer check(source_revision is null or source_revision>0),
  context jsonb not null default '{}'::jsonb check(jsonb_typeof(context)='object' and octet_length(context::text)<=4096),
  state text not null default 'queued' check(state in ('queued','accepted','delivered','failed','bounced','uncertain','suppressed')),
  due_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  changed_at timestamptz not null default now(),
  revision integer not null default 1 check(revision>0),
  attempts integer not null default 0 check(attempts>=0),
  lease_id uuid,
  lease_until timestamptz,
  submitted_at timestamptz,
  provider_id text,
  failure_key text,
  retryable boolean not null default false,
  unique(channel,recipient_key,logical_key),
  check ((recipient_id is null)=(recipient_persona is null)),
  check (kind not in ('invite_guardian','invite_teacher') or (source_revision is not null and channel='email')),
  check (channel<>'push' or (notice_id is not null and recipient_id is not null)),
  check ((lease_id is null)=(lease_until is null))
);
create unique index delivery_email_provider_idx on app.delivery_job(provider_id) where channel='email' and provider_id is not null;
create index delivery_due_idx on app.delivery_job(due_at,id) where state='queued';
create index delivery_event_idx on app.delivery_job(event_id,channel);
create index delivery_scope_idx on app.delivery_job(kind,scope_id,created_at desc,id desc);

create table app.push_delivery_attempt (
  job_id uuid not null references app.delivery_job,
  installation_id uuid not null,
  device_guard uuid not null,
  state text not null default 'queued' check(state in ('queued','sending','accepted','failed','uncertain','suppressed')),
  attempted_at timestamptz,
  attempts integer not null default 0,
  provider_id text,
  failure_key text,
  primary key(job_id,installation_id)
);

create table app.mail_delivery_event (
  event_key text primary key check(char_length(event_key) between 1 and 160),
  provider_id text not null check(char_length(provider_id) between 1 and 160),
  job_id uuid,
  event_kind text not null check(event_kind in ('accepted','delivered','bounced')),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now()
);
create index mail_delivery_event_provider_idx on app.mail_delivery_event(provider_id,occurred_at,event_key);
create index outbox_invitation_events_idx on app.outbox_event(occurred_at,id) where type='invitation.dispatch_requested';
alter table app.delivery_job enable row level security;
alter table app.push_delivery_attempt enable row level security;
alter table app.mail_delivery_event enable row level security;

create function app.queue_invitation_delivery_jobs(maximum integer)
returns integer language sql security definer set search_path=pg_catalog
as $$
  with pending as (
    select e.id,e.aggregate_id,i.generation,i.kind
    from app.outbox_event e join app.invitation i on i.id=e.aggregate_id
    where e.type='invitation.dispatch_requested' and e.payload->>'generation'=i.generation::text
      and not exists(select 1 from app.delivery_job j where j.event_id=e.id and j.channel='email')
    order by e.occurred_at,e.id limit least(greatest(maximum,1),100)
  ), created as (
    insert into app.delivery_job(event_id,logical_key,recipient_key,channel,kind,scope_id,source_revision)
    select p.id,'invite:'||p.aggregate_id||':'||p.generation,p.aggregate_id,'email','invite_'||p.kind,p.aggregate_id,p.generation
    from pending p on conflict(channel,recipient_key,logical_key) do nothing returning id
  ) select count(*)::integer from created
$$;

create function app.enqueue_school_delivery(
  source uuid,logical text,recipient uuid,scope text,target_notice uuid,transport text,category text,resource uuid,
  source_version integer,send_at timestamptz,protected_context jsonb
) returns uuid language plpgsql security definer set search_path=pg_catalog
as $$
declare job uuid;
begin
  insert into app.delivery_job as j(event_id,logical_key,recipient_key,recipient_id,recipient_persona,notice_id,
    channel,kind,scope_id,source_revision,due_at,context)
  values(source,logical,recipient,recipient,scope,target_notice,transport,category,resource,source_version,send_at,protected_context)
  on conflict(channel,recipient_key,logical_key) do nothing returning j.id into job;
  if found then return job; end if;
  return (select j.id from app.delivery_job j where j.channel=transport and j.recipient_key=recipient and j.logical_key=logical);
end
$$;

create function app.sync_invitation_delivery_job() returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
begin
  if new.kind in ('invite_guardian','invite_teacher') and new.state in ('accepted','delivered','bounced') then
    perform app.mark_invitation_delivery(new.scope_id,new.source_revision,case when new.state='bounced' then 'bounced' else 'sent' end);
  end if;
  return new;
end
$$;
create trigger sync_invitation_delivery_job after update of state on app.delivery_job
for each row when(old.state is distinct from new.state) execute function app.sync_invitation_delivery_job();

create function app.claim_delivery_jobs(maximum integer)
returns setof app.delivery_job language plpgsql security definer set search_path=pg_catalog
as $$
begin
  with expired as (
    select j.id,j.channel,j.submitted_at
    from app.delivery_job j where j.state='queued' and j.lease_until<=now()
    order by j.lease_until,j.id limit 100 for update skip locked
  ), attempts as (
    update app.push_delivery_attempt a set state='uncertain',failure_key='confirmation_lost'
    from expired e where e.channel='push' and a.job_id=e.id and a.state='sending'
  )
  update app.delivery_job j set lease_id=null,lease_until=null,changed_at=now(),revision=j.revision+1,
    state=case when e.channel='email' and e.submitted_at is not null then 'uncertain' else 'queued' end,
    failure_key=case when e.channel='email' and e.submitted_at is not null then 'confirmation_lost' else j.failure_key end
  from expired e where j.id=e.id;

  return query with due as (
    select j.id from app.delivery_job j where j.state='queued' and j.lease_id is null and j.due_at<=now()
    order by j.due_at,j.id limit least(greatest(maximum,1),30) for update skip locked
  )
  update app.delivery_job j set attempts=j.attempts+1,lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes',
    changed_at=now(),revision=j.revision+1
  from due where j.id=due.id returning j.*;
end
$$;

create function app.delivery_job_current(job app.delivery_job) returns boolean
language sql stable security definer set search_path=pg_catalog
as $$
  select case
    when job.kind='broadcast' then app.broadcast_recipient_locale(job.scope_id,job.recipient_id) is not null
    else false
  end
$$;

create function app.delivery_mail_target(target uuid,lease uuid)
returns table(email text,locale text,copy jsonb)
language sql stable security definer set search_path=pg_catalog
as $$
  select lower(u.email),
    coalesce(app.broadcast_recipient_locale(b.id,j.recipient_id),p.correspondence_locale,g.correspondence_locale,t.correspondence_locale,ta.correspondence_locale,'ar'),
    b.copy
  from app.delivery_job j join app.account a on a.id=j.recipient_id and a.status='active'
  join auth.users u on u.id=a.provider_subject and u.email_confirmed_at is not null
    and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()) and u.email is not null
  left join app.account_preference p on p.account_id=a.id
  left join app.guardian_profile g on g.account_id=a.id
  left join app.teacher_invite_contact t on t.account_id=a.id
  left join app.teacher_application ta on ta.applicant_id=a.id
  left join app.broadcast_publication b on j.kind='broadcast' and b.id=j.scope_id
  where j.id=target and j.lease_id=lease and j.lease_until>now() and j.state='queued' and j.channel='email'
    and j.recipient_persona=any(app.active_personas(a.id)::text[])
    and app.delivery_job_current(j)
$$;

create function app.start_mail_submission(target uuid,lease uuid,destination text,language_key text) returns boolean
language sql security definer set search_path=pg_catalog
as $$
  with started as (
    update app.delivery_job j set submitted_at=now() where j.id=target and j.state='queued' and j.channel='email'
      and j.lease_id=lease and j.lease_until>now() and j.submitted_at is null and (
        (j.kind in ('invite_guardian','invite_teacher') and exists (
          select 1 from app.invitation_delivery_input(j.scope_id,j.source_revision) i where i.email=destination and i.locale=language_key
        ))
        or (j.kind not in ('invite_guardian','invite_teacher') and exists (
          select 1 from app.delivery_mail_target(target,lease) m where m.email=destination and m.locale=language_key
        ))
      ) returning j.id
  ) select exists(select 1 from started)
$$;

create function app.delivery_device_active(device app.push_subscription) returns boolean
language sql stable security definer set search_path=pg_catalog
as $$
  select device.expires_at>now() and exists (
    select 1 from app.session_binding s join app.account a on a.id=s.account_id and a.status='active'
    join auth.sessions p on p.id=s.provider_session_id and p.user_id=a.provider_subject and (p.not_after is null or p.not_after>now())
    join auth.users u on u.id=a.provider_subject and u.email_confirmed_at is not null and u.deleted_at is null
      and (u.banned_until is null or u.banned_until<=now())
    where s.provider_session_id=device.session_id and s.account_id=device.account_id and s.revoked_at is null
      and s.active_persona=device.persona and device.persona=any(app.active_personas(a.id))
  )
$$;

create function app.delivery_push_devices(target uuid,lease uuid)
returns table(installation_id uuid,guard uuid,platform text,subscription jsonb,locale text,notice_id uuid,email text)
language plpgsql security definer set search_path=pg_catalog
as $$
declare job record;
begin
  select j.* into job from app.delivery_job j where j.id=target and j.lease_id=lease and j.state='queued'
    and j.lease_until>now() and j.channel='push' and app.delivery_job_current(j);
  if not found then return; end if;

  insert into app.push_delivery_attempt(job_id,installation_id,device_guard)
  select job.id,d.installation_id,d.delivery_guard from app.push_subscription d
  where d.account_id=job.recipient_id and d.persona::text=job.recipient_persona and app.delivery_device_active(d)
  on conflict(job_id,installation_id) do nothing;

  update app.push_delivery_attempt a set state='suppressed',failure_key='scope_changed'
  where a.job_id=job.id and a.state='queued' and not exists (
    select 1 from app.push_subscription d where d.installation_id=a.installation_id and d.delivery_guard=a.device_guard
      and d.account_id=job.recipient_id and d.persona::text=job.recipient_persona and app.delivery_device_active(d)
  );

  return query select d.installation_id,d.delivery_guard,d.platform,d.subscription,
    coalesce(p.correspondence_locale,g.correspondence_locale,t.correspondence_locale,ta.correspondence_locale,'ar'),job.notice_id,lower(u.email)
  from app.push_delivery_attempt x join app.push_subscription d on d.installation_id=x.installation_id and d.delivery_guard=x.device_guard
  join app.account a on a.id=d.account_id join auth.users u on u.id=a.provider_subject
  left join app.account_preference p on p.account_id=a.id
  left join app.guardian_profile g on g.account_id=a.id
  left join app.teacher_invite_contact t on t.account_id=a.id
  left join app.teacher_application ta on ta.applicant_id=a.id
  where x.job_id=job.id and x.state='queued' and app.delivery_device_active(d)
  order by d.installation_id;
end
$$;

create function app.start_push_submission(target uuid,lease uuid,device uuid,guard uuid,destination text) returns boolean
language sql security definer set search_path=pg_catalog
as $$
  with started as (
    update app.push_delivery_attempt a set state='sending',attempted_at=now(),attempts=a.attempts+1
    from app.delivery_job j,app.push_subscription p
    where a.job_id=target and a.installation_id=device and a.device_guard=guard and a.state='queued'
      and j.id=a.job_id and j.lease_id=lease and j.lease_until>now() and j.state='queued' and app.delivery_job_current(j)
      and p.installation_id=device and p.delivery_guard=guard and p.account_id=j.recipient_id
      and p.persona::text=j.recipient_persona and app.delivery_device_active(p)
      and exists(select 1 from app.account account join auth.users u on u.id=account.provider_subject
        where account.id=p.account_id and lower(u.email)=destination)
    returning a.job_id
  ) select exists(select 1 from started)
$$;

create function app.finish_push_submission(
  target uuid,lease uuid,device uuid,guard uuid,outcome text,external_id text,problem text,invalid_installation boolean
) returns void language plpgsql security definer set search_path=pg_catalog
as $$
begin
  update app.push_delivery_attempt a set state=case outcome when 'retry' then 'queued' else outcome end,
    provider_id=external_id,failure_key=problem
  from app.delivery_job j
  where a.job_id=target and a.installation_id=device and a.device_guard=guard and a.state in ('queued','sending')
    and j.id=target and j.lease_id=lease and j.lease_until>now() and j.state='queued';
  if found and invalid_installation then
    delete from app.push_subscription d where d.installation_id=device and d.delivery_guard=guard;
  end if;
end
$$;

create function app.finish_delivery_job(
  target uuid,lease uuid,outcome text,external_id text,problem text,retry_after integer,can_retry boolean
) returns boolean language plpgsql security definer set search_path=pg_catalog
as $$
declare finished record;
begin
  update app.delivery_job j set
    state=case when outcome='retry' and j.attempts<6 then 'queued' when outcome='retry' then 'failed' else outcome end,
    provider_id=coalesce(external_id,j.provider_id),lease_id=null,lease_until=null,
    submitted_at=case when outcome='retry' then null else j.submitted_at end,
    due_at=case when outcome='retry' and j.attempts<6 then now()+make_interval(secs=>greatest(
      least(greatest(coalesce(retry_after,0),0),86400),
      least(21600,30*power(2::double precision,least(j.attempts,10)))*(0.8+random()*0.4))) else j.due_at end,
    failure_key=problem,retryable=(outcome='retry' and j.attempts>=6) or (outcome='failed' and coalesce(can_retry,false)),
    changed_at=now(),revision=j.revision+1
  where j.id=target and j.state='queued' and j.lease_id=lease and j.lease_until>now()
  returning j.id,j.state,j.channel,j.provider_id into finished;
  if not found then return false; end if;
  if finished.channel='email' and finished.provider_id is not null and finished.state='accepted' then
    update app.delivery_job j set state=e.event_kind,changed_at=now(),revision=j.revision+1,
      failure_key=case when e.event_kind='bounced' then 'recipient_rejected' end
    from (
      select event_kind from app.mail_delivery_event where provider_id=finished.provider_id
        and event_kind in ('delivered','bounced') order by occurred_at,event_key limit 1
    ) e where j.id=target and j.state='accepted';
  end if;
  return true;
end
$$;

create function app.apply_mail_delivery_event(
  event_key text, external_id text, hinted_job uuid, event_kind text, happened_at timestamptz
) returns boolean language plpgsql security definer set search_path=pg_catalog
as $$
declare job uuid;
begin
  select j.id into job from app.delivery_job j where j.channel='email' and (
    j.provider_id=external_id or (j.id=hinted_job and j.provider_id is null and j.submitted_at is not null)
  ) order by (j.provider_id=external_id) desc nulls last limit 1 for update;
  insert into app.mail_delivery_event(event_key,provider_id,job_id,event_kind,occurred_at)
    values(event_key,external_id,job,event_kind,happened_at) on conflict do nothing;
  if not found then return false; end if;
  if job is not null then
    update app.delivery_job j set provider_id=external_id, state=event_kind,lease_id=null,lease_until=null,
      failure_key=case when event_kind='bounced' then 'recipient_rejected' end,retryable=false,changed_at=now(),revision=j.revision+1
    where j.id=job and j.state in ('queued','uncertain','accepted')
      and (event_kind<>'accepted' or j.state<>'accepted');
  end if;
  return true;
end
$$;


create function app.complete_push_delivery_job(target uuid,lease uuid,retry_after integer)
returns text language plpgsql security definer set search_path=pg_catalog
as $$
declare counts record;
declare outcome text;
begin
  select count(*) filter(where a.state='queued') as queued,
    count(*) filter(where a.state in ('sending','uncertain')) as uncertain,
    count(*) filter(where a.state='accepted') as accepted,
    count(*) filter(where a.state='failed') as failed
  into counts from app.push_delivery_attempt a where a.job_id=target;
  outcome:=case when counts.queued>0 then 'retry' when counts.uncertain>0 then 'uncertain'
    when counts.accepted>0 then 'accepted' when counts.failed>0 then 'failed' else 'suppressed' end;
  if not app.finish_delivery_job(target,lease,outcome,null,
    case outcome when 'uncertain' then 'confirmation_lost' when 'retry' then 'provider_unavailable'
      when 'failed' then 'provider_rejected' when 'suppressed' then 'no_eligible_device' end,
    retry_after,false) then return null; end if;
  return (select state from app.delivery_job where id=target);
end
$$;

create function app.may_view_delivery_job(job app.delivery_job) returns boolean
language sql stable security definer set search_path=pg_catalog
as $$
  select case job.kind
    when 'invite_guardian' then app.has_capability('students.manage')
    when 'invite_teacher' then app.has_capability('applications.manage')
    when 'attendance' then app.has_capability('attendance.supervise')
    when 'academics' then app.has_capability('academics.supervise')
    when 'finance' then app.has_capability('finance.read')
    when 'school' then app.has_capability('comms.publish')
    when 'broadcast' then exists (
      select 1 from app.broadcast_publication b where b.id=job.scope_id and b.publisher_id=app.actor_account()
        and b.publisher_persona=app.actor_persona() and app.broadcast_sender_allowed(b.audience_kind,b.class_id)
    )
    else false end
$$;

create function app.may_operate_delivery_queue() returns boolean
language sql stable security definer set search_path=pg_catalog
as $$
  select app.has_capability('comms.publish') or app.has_capability('students.manage') or app.has_capability('applications.manage')
    or app.has_capability('academics.supervise') or app.has_capability('attendance.supervise') or app.has_capability('finance.read')
    or (app.actor_persona()='teacher' and exists(select 1 from app.broadcast_classes()))
$$;

create function app.delivery_can_redrive(job app.delivery_job) returns boolean
language sql stable security definer set search_path=pg_catalog
as $$
  select job.state='failed' and job.retryable and (job.kind<>'finance'
    or app.has_capability('finance.issue') or app.has_capability('finance.post'))
$$;

create function app.delivery_overview()
returns table(id uuid,kind text,channel text,state text,due_at timestamptz,created_at timestamptz,changed_at timestamptz,
  attempts integer,revision integer,failure text,can_redrive boolean)
language sql stable security definer set search_path=pg_catalog
as $$
  select j.id,j.kind,j.channel,j.state,j.due_at,j.created_at,j.changed_at,j.attempts,j.revision,j.failure_key,
    app.delivery_can_redrive(j)
  from app.delivery_job j where app.may_view_delivery_job(j)
$$;

create function app.redrive_delivery_job(target uuid,expected integer) returns integer
language plpgsql security definer set search_path=pg_catalog
as $$
declare item record;
declare next_revision integer;
begin
  select j.revision,j.lease_id,app.delivery_can_redrive(j) as retryable,
    case when j.kind in ('invite_guardian','invite_teacher') then exists (
      select 1 from app.invitation_delivery_input(j.scope_id,j.source_revision)
    ) else app.delivery_job_current(j) end as current_source
  into item from app.delivery_job j where j.id=target and app.may_view_delivery_job(j) for update;
  if not found then raise exception 'Delivery is unavailable' using errcode='42501'; end if;
  if item.revision<>expected then return null; end if;
  if not item.retryable or item.lease_id is not null or not item.current_source then
    raise exception 'Delivery needs provider reconciliation' using errcode='23P01';
  end if;
  update app.delivery_job j set state='queued',attempts=0,due_at=now(),changed_at=now(),
    submitted_at=null,retryable=false,failure_key=null,revision=j.revision+1
  where j.id=target returning j.revision into next_revision;
  return next_revision;
end
$$;

insert into app.audit_action_rule(action,resource_kind,change_category,allowed_capabilities,link_kind)
values('comms.delivery_redriven','communications','update',
  array['comms.publish','students.manage','applications.manage','attendance.supervise','academics.supervise','finance.read'],null);

revoke all on function app.queue_invitation_delivery_jobs(integer),
  app.enqueue_school_delivery(uuid,text,uuid,text,uuid,text,text,uuid,integer,timestamptz,jsonb),
  app.sync_invitation_delivery_job(),app.claim_delivery_jobs(integer),app.delivery_job_current(app.delivery_job),
  app.delivery_mail_target(uuid,uuid),app.start_mail_submission(uuid,uuid,text,text),
  app.delivery_device_active(app.push_subscription),app.delivery_push_devices(uuid,uuid),
  app.start_push_submission(uuid,uuid,uuid,uuid,text),app.finish_push_submission(uuid,uuid,uuid,uuid,text,text,text,boolean),
  app.finish_delivery_job(uuid,uuid,text,text,text,integer,boolean),app.apply_mail_delivery_event(text,text,uuid,text,timestamptz),
  app.complete_push_delivery_job(uuid,uuid,integer),app.may_view_delivery_job(app.delivery_job),app.delivery_can_redrive(app.delivery_job),app.may_operate_delivery_queue(),app.delivery_overview(),
  app.redrive_delivery_job(uuid,integer)
from public,anon,authenticated,service_role;
grant execute on function app.queue_invitation_delivery_jobs(integer),
  app.enqueue_school_delivery(uuid,text,uuid,text,uuid,text,text,uuid,integer,timestamptz,jsonb),
  app.claim_delivery_jobs(integer),app.delivery_mail_target(uuid,uuid),app.start_mail_submission(uuid,uuid,text,text),
  app.delivery_push_devices(uuid,uuid),app.start_push_submission(uuid,uuid,uuid,uuid,text),
  app.finish_push_submission(uuid,uuid,uuid,uuid,text,text,text,boolean),app.finish_delivery_job(uuid,uuid,text,text,text,integer,boolean),
  app.apply_mail_delivery_event(text,text,uuid,text,timestamptz),app.complete_push_delivery_job(uuid,uuid,integer),
  app.upsert_school_notice(uuid,text,uuid,text,text,jsonb),app.expire_school_broadcast_previews(integer),app.expire_push_installations(integer)
to app_delivery_worker;
grant execute on function app.may_operate_delivery_queue(),app.delivery_overview(),app.redrive_delivery_job(uuid,integer) to app_runtime;


create function app.broadcast_delivery_counts(target uuid)
returns table(pending integer,accepted integer,delivered integer,unresolved integer)
language sql stable security definer set search_path=pg_catalog
as $$
  select count(*) filter(where j.state='queued')::integer,
    count(*) filter(where j.state='accepted')::integer,
    count(*) filter(where j.state='delivered')::integer,
    count(*) filter(where j.state in ('failed','bounced','uncertain'))::integer
  from app.delivery_job j where j.scope_id=target and j.kind='broadcast' and j.channel='email'
    and app.may_view_delivery_job(j)
$$;
revoke all on function app.broadcast_delivery_counts(uuid) from public,anon,authenticated,service_role;
grant execute on function app.broadcast_delivery_counts(uuid) to app_runtime;
