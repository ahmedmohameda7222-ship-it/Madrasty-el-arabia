create table app.notification_projection (
  event_id uuid primary key references app.outbox_event,
  state text not null check(state in ('pending','projected','ignored','invalid')),
  attempts integer not null default 0 check(attempts>=0),
  next_at timestamptz not null default now(),
  finished_at timestamptz,
  issue_key text check(issue_key is null or issue_key ~ '^[a-zA-Z0-9_]{1,32}$')
);
create index notification_retry_idx on app.notification_projection(next_at,event_id) where state='pending';
create table app.chat_unread_episode (
  thread_id uuid not null references app.thread,
  account_id uuid not null references app.account,
  persona text not null check(persona in ('guardian','teacher','admin')),
  episode_id uuid not null unique,
  first_sequence bigint not null check(first_sequence>0),
  first_at timestamptz not null,
  job_id uuid references app.delivery_job,
  primary key(thread_id,account_id,persona)
);
create index chat_unread_episode_jobs on app.chat_unread_episode(job_id) where job_id is not null;
create table app.invoice_reminder (
  invoice_id uuid not null references app.invoice,
  milestone integer not null check(milestone in (-3,3)),
  revision integer not null check(revision>0),
  event_id uuid not null references app.outbox_event,
  due_at timestamptz not null,
  school_date date not null,
  notice_id uuid references app.notification,
  primary key(invoice_id,milestone)
);
create index invoice_reminder_next_idx on app.invoice_reminder(due_at,invoice_id) where notice_id is null;
create table app.absence_follow_up (
  id uuid primary key default gen_random_uuid(),
  row_id uuid not null references app.attendance_row,
  row_revision integer not null check(row_revision>0),
  guardian_id uuid not null references app.account,
  event_id uuid not null references app.outbox_event,
  original_id uuid references app.absence_follow_up,
  thread_id uuid not null references app.thread,
  message_id uuid references app.thread_message,
  notice_id uuid references app.notification,
  template text not null check(template in ('attendance_unexcused','attendance_corrected')),
  corrected_at timestamptz,
  unique(row_id,row_revision,guardian_id)
);
create index absence_follow_up_current_idx on app.absence_follow_up(row_id,guardian_id,row_revision desc);
create table app.absence_correction_channel (
  correction_id uuid not null references app.absence_follow_up,
  original_job_id uuid not null references app.delivery_job,
  correction_job_id uuid references app.delivery_job,
  done_at timestamptz,
  primary key(correction_id,original_job_id)
);
create index absence_correction_pending_idx on app.absence_correction_channel(correction_id,original_job_id) where done_at is null;

alter table app.notification_projection enable row level security;
alter table app.chat_unread_episode enable row level security;
alter table app.invoice_reminder enable row level security;
alter table app.absence_follow_up enable row level security;
alter table app.absence_correction_channel enable row level security;
alter table app.thread_message add column corrected_at timestamptz;

create function app.communication_event_type(event_type text) returns boolean
language sql immutable set search_path=pg_catalog
as $$
  select event_type in ('teacher_application.decided','family.link_approved','family.link_revoked','attendance.arrival_confirmed',
    'attendance.unexcused_confirmed','attendance.corrected','broadcast.published','chat.message_created','exam.published','result.published',
    'enrollment.stop_requested','enrollment.stop_withdrawn','enrollment.stop_approved','enrollment.stop_rejected','invoice.issued',
    'payment.recorded','payment.reversed','finance.stop_review_resolved','finance.stop_refund_recorded')
$$;
create index outbox_communication_events_idx on app.outbox_event(occurred_at,id) where app.communication_event_type(type);
create index outbox_results_batch_idx on app.outbox_event((payload->>'batchId'),id) where type='result.published';
create index outbox_human_source_idx on app.outbox_event(aggregate_id,(payload->>'messageId')) where type='chat.message_created';

create function app.pending_notification_events(maximum integer) returns setof app.outbox_event
language sql volatile security definer set search_path=pg_catalog
as $$
  select e.* from app.outbox_event e left join app.notification_projection p on p.event_id=e.id
  where app.communication_event_type(e.type) and (p.event_id is null or p.state='pending' and p.next_at<=now())
  order by e.occurred_at,e.id limit greatest(1,least(maximum,40))
  for update of e skip locked
$$;

create function app.communication_account_current(target uuid,scope text) returns boolean
language sql stable set search_path=pg_catalog
as $$
  select exists(select 1 from app.account a join auth.users u on u.id=a.provider_subject
    where a.id=target and a.status='active' and u.email_confirmed_at is not null and u.deleted_at is null
      and (u.banned_until is null or u.banned_until<=now()))
    and (scope='applicant' or app.contact_account_active(target,scope))
$$;

create function app.communication_guardians(child uuid)
returns table(account_id uuid) language sql stable set search_path=pg_catalog
as $$
  select distinct g.account_id from app.child_link l join app.guardian_profile g on g.id=l.guardian_id
  join app.student p on p.id=l.student_id and p.state='active'
  where l.student_id=child and l.state='approved' and l.effective_from<=now()
    and (l.effective_until is null or l.effective_until>now()) and app.communication_account_current(g.account_id,'guardian')
$$;

create function app.communication_guardian_current(target uuid,child uuid) returns boolean
language sql stable set search_path=pg_catalog
as $$ select exists(select 1 from app.communication_guardians(child) g where g.account_id=target) $$;

create function app.communication_locale(target uuid) returns text
language sql stable set search_path=pg_catalog
as $$
  select coalesce((select p.correspondence_locale from app.account_preference p where p.account_id=target),
    (select p.correspondence_locale from app.guardian_profile p where p.account_id=target),
    (select p.correspondence_locale from app.teacher_invite_contact p where p.account_id=target),
    (select p.correspondence_locale from app.teacher_application p where p.applicant_id=target),'ar')
$$;

create function app.communication_thread_current(target uuid,recipient uuid,role_key text) returns boolean
language sql stable set search_path=pg_catalog
as $$
  select app.communication_account_current(recipient,role_key) and exists(
    select 1 from app.thread t left join app.office_case c on c.thread_id=t.id
    where t.id=target and (
      t.kind='direct' and exists(select 1 from app.thread_participant p
        where p.thread_id=t.id and p.account_id=recipient and p.persona=role_key)
        and app.directory_relationship_allowed(t.opened_by,t.opened_persona,
          case when t.opened_by=t.pair_first then t.pair_second else t.pair_first end,
          case when t.opened_by=t.pair_first then t.persona_second else t.persona_first end)
      or t.kind='office' and (
        c.requester_id=recipient and c.requester_persona=role_key and (
          c.origin_kind is null
          or c.origin_kind='attendance' and exists(select 1 from app.attendance_row r where r.id=c.origin_id
            and app.communication_guardian_current(recipient,r.student_id))
          or c.origin_kind='invoice' and exists(select 1 from app.invoice j where j.id=c.origin_id
            and j.payer_account_id=recipient and app.communication_guardian_current(recipient,j.student_id))
        )
        or role_key='admin' and app.office_delegate_active(c.inbox,recipient)
          and (c.assignee_id=recipient or c.assignee_id is null or not app.office_delegate_active(c.inbox,c.assignee_id))
      )
    )
  )
$$;

create function app.communication_target(kind_key text,target uuid,child uuid default null,day_key date default null) returns jsonb
language sql immutable set search_path=pg_catalog
as $$ select jsonb_strip_nulls(jsonb_build_object('kind',kind_key,'id',target,'childId',child,'date',day_key)) $$;

create function app.materialize_school_notice(source uuid,recipient uuid,scope text,identifier text,
  template text,category text,resource uuid,source_version integer,destinations jsonb,mail boolean,push boolean,protected_context jsonb default '{}'::jsonb)
returns uuid language plpgsql volatile set search_path=pg_catalog
as $$
declare notice uuid;
declare context jsonb:=jsonb_build_object('template',template)||protected_context;
begin
  if not app.communication_account_current(recipient,scope) then return null; end if;
  notice:=app.upsert_school_notice(recipient,scope,source,identifier,template,destinations);
  if mail then
    perform app.enqueue_school_delivery(source,identifier,recipient,scope,notice,'email',category,resource,source_version,now(),context);
  end if;
  if push and scope<>'applicant' then
    perform app.enqueue_school_delivery(source,identifier,recipient,scope,notice,'push',category,resource,source_version,now(),context);
  end if;
  return notice;
end
$$;

create function app.communication_invoice_current(target uuid,recipient uuid) returns boolean
language sql stable set search_path=pg_catalog
as $$
  select exists(select 1 from app.invoice j where j.id=target and j.payer_account_id=recipient
    and app.communication_guardian_current(recipient,j.student_id))
$$;

create function app.communication_invoice_open(target uuid,recipient uuid,invoice_revision integer) returns boolean
language sql stable set search_path=pg_catalog
as $$
  select exists(select 1 from app.invoice j where j.id=target and j.revision=invoice_revision
    and app.communication_invoice_current(j.id,recipient) and not app.finance_reminder_held(j.id)
    and app.invoice_collectible_minor(j.id,'infinity'::timestamptz)>app.invoice_allocated_minor(j.id))
$$;

create function app.communication_receipt_current(target uuid,recipient uuid) returns boolean
language sql stable set search_path=pg_catalog
as $$
  select exists(select 1 from app.payer_receipt p join app.receipt_allocation a on a.receipt_id=p.receipt_id
    join app.invoice j on j.id=a.invoice_id and j.payer_account_id=p.payer_id
    where p.id=target and p.payer_id=recipient and app.communication_guardian_current(recipient,j.student_id))
$$;

create function app.communication_result_current(aggregate uuid,payload jsonb) returns boolean
language sql stable set search_path=pg_catalog
as $$
  select case payload->>'sourceKind'
    when 'exam' then exists(select 1 from app.exam_result r join app.exam_result_publication p on p.id=r.published_id
      where r.id=aggregate and r.student_id=(payload->>'studentId')::uuid and r.exam_id=(payload->>'sourceId')::uuid
        and p.id=(payload->>'publicationId')::uuid and p.revision=(payload->>'revision')::integer)
    when 'evaluation' then exists(select 1 from app.student_evaluation r join app.evaluation_publication p on p.id=r.current_publication_id
      where r.id=aggregate and r.student_id=(payload->>'studentId')::uuid and r.id=(payload->>'sourceId')::uuid
        and p.id=(payload->>'publicationId')::uuid and p.revision=(payload->>'revision')::integer)
    when 'homework' then exists(select 1 from app.homework_roster r where r.id=aggregate and r.homework_id=(payload->>'sourceId')::uuid
      and r.student_id=(payload->>'studentId')::uuid and r.revision=(payload->>'revision')::integer and r.marked_at is not null)
    when 'activity' then exists(select 1 from app.activity_mark r where r.id=aggregate and r.activity_id=(payload->>'sourceId')::uuid
      and r.student_id=(payload->>'studentId')::uuid and r.revision=(payload->>'revision')::integer and r.visible_at<=now())
    else false end
$$;

create function app.communication_exam_current(target uuid,announcement uuid,revision_key integer,child uuid) returns boolean
language sql stable set search_path=pg_catalog
as $$
  select exists(select 1 from app.exam e join app.exam_announcement a on a.id=e.announced_id
    join app.class_subject o on o.id=e.offering_id join app.enrollment r on r.class_id=o.class_id and r.student_id=child
    where e.id=target and a.id=announcement and a.revision=revision_key and r.voided_at is null
      and r.effective_from<=a.exam_date and a.exam_date<r.effective_until)
$$;

create function app.communication_attendance_current(target uuid,revision_key integer,unexcused boolean) returns boolean
language sql stable set search_path=pg_catalog
as $$
  select exists(select 1 from app.attendance_row r join app.attendance_sheet s on s.id=r.sheet_id
    where r.id=target and r.revision=revision_key and s.state='approved'
      and (not unexcused or s.calendar_cancelled_at is null and r.status='absent_unexcused'))
$$;


create function app.first_unread_human(target uuid,recipient uuid,role_key text)
returns table(message_id uuid,sequence bigint,created_at timestamptz)
language sql stable set search_path=pg_catalog
as $$
  select m.id,m.sequence,m.created_at from app.thread_message m
  left join app.thread_reader r on r.thread_id=target and r.account_id=recipient and r.persona=role_key
  where m.thread_id=target and m.source='human' and m.author_id<>recipient and m.sequence>coalesce(r.read_through,0)
  order by m.sequence limit 1
$$;

create function app.suppress_unsent_delivery(target uuid) returns void
language sql volatile set search_path=pg_catalog
as $$
  update app.delivery_job j set state='suppressed',failure_key='scope_changed',lease_id=null,lease_until=null,
    changed_at=now(),revision=j.revision+1
  where j.id=target and j.state='queued' and j.submitted_at is null and not exists(
    select 1 from app.push_delivery_attempt a where a.job_id=j.id and a.state in ('sending','uncertain','accepted'))
$$;

create function app.refresh_chat_episode(target uuid,recipient uuid,role_key text,trigger_event uuid default null)
returns void language plpgsql volatile set search_path=pg_catalog
as $$
declare first_message record;
declare episode app.chat_unread_episode%rowtype;
declare prior app.delivery_job%rowtype;
declare episode_key uuid;
declare job_key uuid;
declare source uuid;
declare notice uuid;
declare identifier text;
declare due timestamptz;
declare targets jsonb:=jsonb_build_array(app.communication_target('thread',target));
begin
  perform 1 from app.thread t where t.id=target for update;
  select e.* into episode from app.chat_unread_episode e
    where e.thread_id=target and e.account_id=recipient and e.persona=role_key for update;
  if app.communication_thread_current(target,recipient,role_key) then
    select * into first_message from app.first_unread_human(target,recipient,role_key);
  else
    perform app.suppress_unsent_delivery(episode.job_id);
    return;
  end if;
  if first_message.message_id is null then
    perform app.suppress_unsent_delivery(episode.job_id);
    delete from app.chat_unread_episode e where e.thread_id=target and e.account_id=recipient and e.persona=role_key;
    return;
  end if;

  if episode.job_id is not null then
    select j.* into prior from app.delivery_job j where j.id=episode.job_id;
    if (prior.state='queued' and prior.submitted_at is not null) or prior.state in ('accepted','delivered','bounced','uncertain') then return; end if;
    if episode.first_sequence=first_message.sequence then return; end if;
    perform app.suppress_unsent_delivery(episode.job_id);
  end if;
  select e.id into source from app.outbox_event e where e.type='chat.message_created' and e.aggregate_id=target
    and e.payload->>'messageId'=first_message.message_id::text order by e.occurred_at,e.id limit 1;
  source:=coalesce(source,trigger_event);
  if source is null then return; end if;
  episode_key:=coalesce(episode.episode_id,gen_random_uuid());
  due:=first_message.created_at+interval '48 hours';
  identifier:='chat-reminder:'||episode_key||':'||first_message.sequence;
  select n.id into notice from app.notification n where n.recipient_id=recipient and n.recipient_persona=role_key
    and n.logical_key='chat:'||first_message.message_id;
  if notice is null then notice:=app.upsert_school_notice(recipient,role_key,source,'chat:'||first_message.message_id,'human_message',targets); end if;
  job_key:=app.enqueue_school_delivery(source,identifier,recipient,role_key,notice,'email','chat_reminder',target,null,
    due,jsonb_build_object('template','human_message','episodeId',episode_key,'sequence',first_message.sequence));
  insert into app.chat_unread_episode as e(thread_id,account_id,persona,episode_id,first_sequence,first_at,job_id)
    values(target,recipient,role_key,episode_key,first_message.sequence,first_message.created_at,job_key)
    on conflict(thread_id,account_id,persona) do update set first_sequence=excluded.first_sequence,first_at=excluded.first_at,job_id=excluded.job_id;
end
$$;

create function app.refresh_episode_after_read() returns trigger
language plpgsql security definer set search_path=pg_catalog
as $$
begin
  if not exists(select 1 from app.first_unread_human(new.thread_id,new.account_id,new.persona)) then
    perform app.suppress_unsent_delivery(e.job_id) from app.chat_unread_episode e
      where e.thread_id=new.thread_id and e.account_id=new.account_id and e.persona=new.persona;
    delete from app.chat_unread_episode e where e.thread_id=new.thread_id and e.account_id=new.account_id and e.persona=new.persona;
  end if;
  return new;
end
$$;
create trigger refresh_episode_after_read after insert or update of read_through on app.thread_reader
for each row execute function app.refresh_episode_after_read();

create function app.sweep_chat_episodes(maximum integer) returns integer
language plpgsql volatile security definer set search_path=pg_catalog
as $$
declare episode record;
declare count_touched integer:=0;
begin
  for episode in select e.* from app.chat_unread_episode e join app.delivery_job j on j.id=e.job_id
    cross join lateral app.first_unread_human(e.thread_id,e.account_id,e.persona) unread
    where e.first_sequence<>unread.sequence and j.state in ('queued','suppressed','failed') and j.submitted_at is null
    order by e.thread_id,e.account_id,e.persona limit greatest(1,least(maximum,30))
  loop
    perform app.refresh_chat_episode(episode.thread_id,episode.account_id,episode.persona,null);
    count_touched:=count_touched+1;
  end loop;
  return count_touched;
end
$$;

create function app.refresh_invoice_reminders(target uuid,source uuid) returns void
language plpgsql volatile set search_path=pg_catalog
as $$
declare j app.invoice%rowtype;
declare zone text;
declare milestone integer;
declare local_due date;
declare send_at timestamptz;
begin
  select i.* into j from app.invoice i where i.id=target for update;
  if not found then return; end if;
  if not app.communication_invoice_open(j.id,j.payer_account_id,j.revision) then
    delete from app.invoice_reminder r where r.invoice_id=j.id and r.notice_id is null;
    return;
  end if;
  select s.timezone into zone from app.school_settings s where s.singleton;
  foreach milestone in array array[-3,3] loop
    local_due:=j.due_date+milestone;
    send_at:=(local_due+time '09:00') at time zone zone;
    if send_at<=now() or local_due=(j.issued_at at time zone zone)::date then continue; end if;
    insert into app.invoice_reminder as r(invoice_id,milestone,revision,event_id,due_at,school_date)
      values(j.id,milestone,j.revision,source,send_at,local_due)
      on conflict(invoice_id,milestone) do update set revision=excluded.revision,event_id=excluded.event_id,
        due_at=excluded.due_at,school_date=excluded.school_date where r.notice_id is null;
  end loop;
end
$$;

create function app.materialize_due_invoice_reminders(maximum integer) returns integer
language plpgsql volatile security definer set search_path=pg_catalog
as $$
declare due record;
declare notice uuid;
declare tally integer:=0;
begin
  for due in select r.*,j.payer_account_id from app.invoice_reminder r join app.invoice j on j.id=r.invoice_id
    where r.notice_id is null and r.due_at<=now() order by r.due_at,r.invoice_id,r.milestone
    limit greatest(1,least(maximum,30)) for update of r skip locked
  loop
    if due.school_date=app.school_today() and app.communication_invoice_open(due.invoice_id,due.payer_account_id,due.revision) then
      notice:=app.materialize_school_notice(due.event_id,due.payer_account_id,'guardian',
        'invoice:'||due.invoice_id||':due:'||due.milestone,'invoice_reminder','finance',due.invoice_id,due.revision,
        jsonb_build_array(app.communication_target('invoice',due.invoice_id)),true,true);
      update app.invoice_reminder r set notice_id=notice where r.invoice_id=due.invoice_id and r.milestone=due.milestone;
      tally:=tally+1;
    else
      delete from app.invoice_reminder r where r.invoice_id=due.invoice_id and r.milestone=due.milestone;
    end if;
  end loop;
  return tally;
end
$$;


create function app.absence_case_thread(row_key uuid,recipient uuid) returns uuid
language plpgsql volatile set search_path=pg_catalog
as $$
declare target uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('madrasty:absence-case:'||row_key||':'||recipient,0));
  select c.thread_id into target from app.office_case c
    where c.requester_id=recipient and c.requester_persona='guardian' and c.inbox='student_affairs'
      and c.origin_kind='attendance' and c.origin_id=row_key;
  if target is not null then return target; end if;
  insert into app.thread as t(kind,opened_by,opened_persona) values('office',recipient,'guardian') returning t.id into target;
  insert into app.office_case(thread_id,requester_id,requester_persona,inbox,origin_kind,origin_id)
    values(target,recipient,'guardian','student_affairs','attendance',row_key)
    on conflict(requester_id,requester_persona,inbox,origin_kind,origin_id) do nothing;
  if not found then
    delete from app.thread t where t.id=target;
    return (select c.thread_id from app.office_case c where c.requester_id=recipient and c.requester_persona='guardian'
      and c.inbox='student_affairs' and c.origin_kind='attendance' and c.origin_id=row_key);
  end if;
  insert into app.thread_participant(thread_id,account_id,persona) values(target,recipient,'guardian');
  insert into app.thread_reference(thread_id,reference_kind,reference_id,added_by) values(target,'attendance',row_key,recipient);
  return target;
end
$$;

create function app.publish_absence_message(source uuid,row_key uuid,revision_key integer,recipient uuid,template_key text,root_key uuid)
returns uuid language plpgsql volatile set search_path=pg_catalog
as $$
declare target uuid:=app.absence_case_thread(row_key,recipient);
declare projection uuid;
declare message uuid;
declare notice uuid;
declare referenced uuid;
declare body_text text;
declare one record;
declare locale text:=app.communication_locale(recipient);
declare next_sequence bigint;
declare target_row app.attendance_row%rowtype;
declare identifier text:='attendance:'||row_key||':'||revision_key;
begin
  select r.* into target_row from app.attendance_row r where r.id=row_key;
  select t.last_sequence+1 into next_sequence from app.thread t where t.id=target for update;
  insert into app.absence_follow_up as p(row_id,row_revision,guardian_id,event_id,original_id,thread_id,template)
    values(row_key,revision_key,recipient,source,root_key,target,template_key)
    on conflict(row_id,row_revision,guardian_id) do nothing returning p.id into projection;
  if not found then return null; end if;
  if root_key is not null then select p.message_id into referenced from app.absence_follow_up p where p.id=root_key; end if;
  for one in select old.* from app.absence_follow_up old where old.row_id=row_key and old.guardian_id=recipient
    and old.row_revision<revision_key and old.corrected_at is null order by old.row_revision for update
  loop
    update app.absence_follow_up set corrected_at=now() where id=one.id;
    update app.notification set superseded_at=coalesce(superseded_at,now()) where id=one.notice_id;
    update app.thread_message set corrected_at=now(),
      body=body||case locale when 'de' then E'\nAnwesenheit später korrigiert.' else E'\nاتصحّح سجل الحضور بعد الرسالة دي.' end
      where id=one.message_id and corrected_at is null;
    perform app.suppress_unsent_delivery(j.id) from app.delivery_job j where j.notice_id=one.notice_id;
  end loop;
  body_text:=case template_key when 'attendance_unexcused' then
    case locale when 'de' then 'Die Schule hat eine unentschuldigte Abwesenheit bestätigt. Sie können dem Schulbüro hier antworten.'
      else 'المدرسة أكدت تسجيل غياب من غير عذر. تقدر ترد على شؤون الطلبة هنا.' end
    else case locale when 'de' then 'Die Schule hat den zuvor gemeldeten Anwesenheitseintrag korrigiert. Sie können dem Schulbüro hier antworten.'
      else 'المدرسة صحّحت سجل الحضور اللي وصلك عنه إشعار. تقدر ترد على شؤون الطلبة هنا.' end end;
  insert into app.thread_message as m(thread_id,sequence,source,system_event_id,body,reply_to_id,replyable)
    values(target,next_sequence,'system',projection,body_text,referenced,true) returning m.id into message;
  update app.thread t set last_sequence=next_sequence,last_message_at=now() where t.id=target;
  update app.thread_reader r set archived=false,updated_at=now() where r.thread_id=target and r.archived;
  update app.office_case c set status='open',updated_at=now(),revision=c.revision+1 where c.thread_id=target and c.status='closed';

  notice:=app.materialize_school_notice(source,recipient,'guardian',identifier,template_key,'attendance',row_key,revision_key,
    jsonb_build_array(app.communication_target('thread',target),
      app.communication_target('attendance',row_key,target_row.student_id,target_row.school_date)),
    root_key is null,root_key is null,jsonb_build_object('absenceId',projection));
  update app.absence_follow_up set message_id=message,notice_id=notice where id=projection;
  if root_key is not null then
    insert into app.absence_correction_channel(correction_id,original_job_id)
    select projection,j.id from app.absence_follow_up a join app.delivery_job j on j.notice_id=a.notice_id
    where a.id=root_key on conflict do nothing;
  end if;
  return projection;
end
$$;

create function app.project_attendance_follow_up(source uuid,row_key uuid,body jsonb,corrected boolean) returns integer
language plpgsql volatile set search_path=pg_catalog
as $$
declare revision_key integer:=(body->>'revision')::integer;
declare child uuid:=(body->>'studentId')::uuid;
declare recipient uuid;
declare root uuid;
declare unexcused boolean:=not corrected or (body->>'status'='absent_unexcused' and not (body->>'calendarCancelled')::boolean);
declare result integer:=0;
declare template_key text;
begin
  perform 1 from app.attendance_row r where r.id=row_key and r.student_id=child for share;
  if not found or not app.communication_attendance_current(row_key,revision_key,unexcused) or not exists(
    select 1 from app.attendance_approved_event a where a.row_id=row_key and a.row_revision=revision_key and a.event_id=source
  ) then return 0; end if;
  for recipient in select g.account_id from app.communication_guardians(child) g order by g.account_id loop
    root:=null;
    if corrected then
      select coalesce(p.original_id,p.id) into root from app.absence_follow_up p
      where p.row_id=row_key and p.guardian_id=recipient and p.row_revision<revision_key order by p.row_revision desc limit 1;
    end if;
    if unexcused and (root is null or body->>'priorStatus'<>'absent_unexcused') then
      root:=null;
      template_key:='attendance_unexcused';
    elsif root is not null then
      template_key:='attendance_corrected';
    else continue;
    end if;
    if app.publish_absence_message(source,row_key,revision_key,recipient,template_key,root) is not null then result:=result+1; end if;
  end loop;
  return result;
end
$$;

create function app.materialize_absence_corrections(maximum integer) returns integer
language plpgsql volatile security definer set search_path=pg_catalog
as $$
declare item record;
declare queued uuid;
declare count_touched integer:=0;
begin
  for item in select p.id,p.event_id,p.row_id,p.row_revision,p.guardian_id,p.notice_id,c.original_job_id,
    j.channel,j.state,j.submitted_at,r.student_id
    from app.absence_correction_channel c join app.absence_follow_up p on p.id=c.correction_id
    join app.delivery_job j on j.id=c.original_job_id join app.attendance_row r on r.id=p.row_id
    where c.done_at is null and (
      j.channel='email' and j.state in ('delivered','bounced','failed','suppressed')
      or j.channel='push' and j.state<>'queued'
      or p.corrected_at is not null or not app.communication_guardian_current(p.guardian_id,r.student_id)
    )
    order by p.row_revision,c.original_job_id limit greatest(1,least(maximum,30)) for update of c skip locked
  loop
    queued:=null;
    if app.communication_attendance_current(item.row_id,item.row_revision,false)
      and app.communication_guardian_current(item.guardian_id,item.student_id)
      and (item.channel='email' and item.state='delivered' or item.channel='push' and exists(
        select 1 from app.push_delivery_attempt a where a.job_id=item.original_job_id and a.state='accepted')) then
      queued:=app.enqueue_school_delivery(item.event_id,'attendance:'||item.row_id||':'||item.row_revision,
        item.guardian_id,'guardian',item.notice_id,item.channel,'attendance',item.row_id,item.row_revision,now(),
        jsonb_build_object('template','attendance_corrected','absenceId',item.id,'originalJobId',item.original_job_id));
    end if;
    update app.absence_correction_channel c set done_at=now(),correction_job_id=queued
      where c.correction_id=item.id and c.original_job_id=item.original_job_id;
    count_touched:=count_touched+1;
  end loop;
  return count_touched;
end
$$;


create function app.project_broadcast(source uuid,target uuid) returns boolean
language plpgsql volatile set search_path=pg_catalog
as $$
declare item record;
declare role_key text;
declare notice uuid;
begin
  for item in select r.account_id,b.audience_kind from app.broadcast_recipient r
    join app.broadcast_publication b on b.id=r.publication_id
    where b.id=target and r.dispatch_state='pending' order by r.account_id limit 100 for update of r
  loop
    notice:=null;
    if app.broadcast_recipient_locale(target,item.account_id) is not null then
      role_key:=case item.audience_kind when 'all_teachers' then 'teacher' else 'guardian' end;
      notice:=app.materialize_school_notice(source,item.account_id,role_key,'broadcast:'||target,'broadcast','broadcast',
        target,null,jsonb_build_array(app.communication_target('broadcast',target)),true,true);
    end if;
    update app.broadcast_recipient r set dispatch_state=case when notice is null then 'suppressed' else 'queued' end
      where r.publication_id=target and r.account_id=item.account_id;
  end loop;
  return not exists(select 1 from app.broadcast_recipient r where r.publication_id=target and r.dispatch_state='pending');
end
$$;

create function app.project_human_chat(source uuid,target uuid,message_key uuid,high_water bigint) returns void
language plpgsql volatile set search_path=pg_catalog
as $$
declare sender uuid;
declare recipient record;
begin
  perform 1 from app.thread t where t.id=target for update;
  select m.author_id into sender from app.thread_message m where m.thread_id=target and m.id=message_key
    and m.sequence=high_water and m.source='human';
  if sender is null then return; end if;
  for recipient in
    select p.account_id,p.persona from app.thread_participant p where p.thread_id=target
    union select g.account_id,'admin' from app.office_case c join app.inbox_grant g on g.inbox=c.inbox
      where c.thread_id=target and app.office_delegate_active(c.inbox,g.account_id)
    order by account_id,persona
  loop
    if recipient.account_id=sender or not app.communication_thread_current(target,recipient.account_id,recipient.persona) then continue; end if;
    perform app.materialize_school_notice(source,recipient.account_id,recipient.persona,'chat:'||message_key,
      'human_message','chat_reminder',target,null,jsonb_build_array(app.communication_target('thread',target)),false,true,
      jsonb_build_object('sequence',high_water));
    perform app.refresh_chat_episode(target,recipient.account_id,recipient.persona,source);
  end loop;
end
$$;

create function app.project_examination(source uuid,target uuid,body jsonb) returns void
language plpgsql volatile set search_path=pg_catalog
as $$
declare recipient record;
declare revision_key integer:=(body->>'revision')::integer;
declare announcement uuid:=(body->>'announcementId')::uuid;
declare cohort_class uuid:=(body->>'classId')::uuid;
declare local_day date:=(body->>'date')::date;
begin
  for recipient in
    select c.account_id,jsonb_agg(app.communication_target('exam',target,c.student_id) order by c.student_id) as destinations
    from (
      select distinct g.account_id,r.student_id from app.roster_on(cohort_class,local_day) r
      cross join lateral app.communication_guardians(r.student_id) g
      where app.communication_exam_current(target,announcement,revision_key,r.student_id)
    ) c group by c.account_id order by c.account_id
  loop
    perform app.materialize_school_notice(source,recipient.account_id,'guardian','exam:'||target||':'||revision_key,
      'exam_scheduled','academics',target,revision_key,(select jsonb_agg(x.one) from (
        select one from jsonb_array_elements(recipient.destinations) x(one) limit 50
      ) x),true,true,jsonb_build_object('announcementId',announcement));
  end loop;
end
$$;

create function app.project_result_batch(source uuid,aggregate uuid,body jsonb) returns void
language plpgsql volatile set search_path=pg_catalog
as $$
declare recipient record;
declare target_batch text:=body->>'batchId';
declare revision_key integer:=(body->>'revision')::integer;
declare template_key text:=case body->>'change' when 'correction' then 'result_corrected' else 'result_published' end;
declare identifier text:=case when target_batch is not null then 'result:batch:'||target_batch else 'result:'||aggregate||':'||revision_key end;
begin
  for recipient in
    select c.account_id,jsonb_agg(c.destination order by c.destination) as destinations
    from (
      select distinct g.account_id,app.communication_target(e.payload->>'sourceKind',(e.payload->>'sourceId')::uuid,
        (e.payload->>'studentId')::uuid) as destination
      from app.outbox_event e cross join lateral app.communication_guardians((e.payload->>'studentId')::uuid) g
      where e.type='result.published' and (target_batch is null and e.id=source or e.payload->>'batchId'=target_batch)
        and app.communication_result_current(e.aggregate_id,e.payload)
    ) c group by c.account_id order by c.account_id
  loop
    perform app.materialize_school_notice(source,recipient.account_id,'guardian',identifier,template_key,'academics',aggregate,
      case when target_batch is null then revision_key end,
      (select jsonb_agg(x.one) from (select one from jsonb_array_elements(recipient.destinations) x(one) limit 50) x),
      true,true,jsonb_strip_nulls(jsonb_build_object('batchId',target_batch)));
  end loop;
end
$$;

create function app.project_finance_posting(source uuid,target uuid,body jsonb,is_reversal boolean) returns void
language plpgsql volatile set search_path=pg_catalog
as $$
declare entry record;
declare revision_key integer:=(body->>'revision')::integer;
declare posting_key uuid:=(body->>'postingId')::uuid;
declare invoice_key uuid;
declare template_key text:=case when is_reversal then 'payment_reversed' else 'payment_recorded' end;
begin
  if not exists(select 1 from app.receipt_posting p where p.receipt_id=target and p.id=posting_key
    and p.revision=revision_key and p.kind=body->>'kind') then return; end if;
  for invoice_key in select distinct (x.one->>'invoiceId')::uuid from jsonb_array_elements(body->'items') x(one)
    order by (x.one->>'invoiceId')::uuid
  loop
    perform app.refresh_invoice_reminders(invoice_key,source);
  end loop;
  for entry in select distinct x."payerId" as payer,x."payerReceiptId" as receipt_key
    from jsonb_to_recordset(body->'items') x("payerId" uuid,"payerReceiptId" uuid,"studentId" uuid,"invoiceId" uuid,"allocationId" uuid)
    join app.invoice j on j.id=x."invoiceId" and j.payer_account_id=x."payerId" and j.student_id=x."studentId"
    join app.payer_receipt p on p.id=x."payerReceiptId" and p.payer_id=j.payer_account_id and p.receipt_id=target
    join app.receipt_allocation a on a.id=x."allocationId" and a.invoice_id=j.id and a.receipt_id=target
    left join app.receipt_reversal rev on rev.allocation_id=a.id
    where app.communication_guardian_current(x."payerId",x."studentId")
      and (is_reversal and rev.posting_id=posting_key or not is_reversal and a.posting_id=posting_key and rev.allocation_id is null)
    order by payer,receipt_key
  loop
    perform app.materialize_school_notice(source,entry.payer,'guardian','receipt:'||entry.receipt_key||':'||
      case when is_reversal then 'reverse:'||revision_key else 'record' end,template_key,'finance',entry.receipt_key,
      revision_key,jsonb_build_array(app.communication_target('receipt',entry.receipt_key)),true,true);
  end loop;
end
$$;

create function app.project_communications(source uuid) returns boolean
language plpgsql volatile set search_path=pg_catalog
as $$
declare e app.outbox_event%rowtype;
declare body jsonb;
declare child uuid;
declare recipient uuid;
declare revision_key integer;
declare entry record;
begin
  select a.* into e from app.outbox_event a where a.id=source;
  if not found then return true; end if;
  body:=e.payload;
  child:=(body->>'studentId')::uuid;
  revision_key:=(body->>'revision')::integer;
  case e.type
    when 'teacher_application.decided' then
      select a.applicant_id into recipient from app.teacher_application a where a.id=e.aggregate_id
        and a.applicant_id=(body->>'applicantId')::uuid and a.state=body->>'decision' and a.revision=revision_key;
      if recipient is not null then
        perform app.materialize_school_notice(source,recipient,'applicant','application:'||e.aggregate_id||':'||revision_key,
          'application_decided','school',e.aggregate_id,revision_key,jsonb_build_array(app.communication_target('application',e.aggregate_id)),false,false);
      end if;
    when 'family.link_approved' then
      select g.account_id into recipient from app.child_link l join app.guardian_profile g on g.id=l.guardian_id
        where l.id=e.aggregate_id and l.revision=revision_key and l.state='approved'
          and l.guardian_id=(body->>'guardianId')::uuid and l.student_id=child;
      if recipient is not null and app.communication_guardian_current(recipient,child) then
        perform app.materialize_school_notice(source,recipient,'guardian','link:'||e.aggregate_id||':'||revision_key,
          'child_linked','school',e.aggregate_id,revision_key,jsonb_build_array(app.communication_target('child',child)),false,true);
      end if;
    when 'family.link_revoked' then
      for entry in select j.id from app.invoice j where j.student_id=child and j.guardian_id=(body->>'guardianId')::uuid order by j.id
      loop perform app.refresh_invoice_reminders(entry.id,source); end loop;
    when 'attendance.arrival_confirmed' then
      if (body->>'precedingExcuse')::boolean and exists(select 1 from app.attendance_row r
        where r.id=e.aggregate_id and r.revision=revision_key and r.student_id=child and r.confirmed_arrival_at is not null) then
        for recipient in select g.account_id from app.communication_guardians(child) g order by g.account_id loop
          perform app.materialize_school_notice(source,recipient,'guardian','arrival:'||e.aggregate_id||':'||revision_key,
            'arrival_confirmed','attendance',e.aggregate_id,revision_key,
            jsonb_build_array(app.communication_target('attendance',e.aggregate_id,child,(body->>'schoolDate')::date)),false,true);
        end loop;
      end if;
    when 'attendance.unexcused_confirmed','attendance.corrected' then
      perform app.project_attendance_follow_up(source,e.aggregate_id,body,e.type='attendance.corrected');
    when 'broadcast.published' then return app.project_broadcast(source,e.aggregate_id);
    when 'chat.message_created' then perform app.project_human_chat(source,e.aggregate_id,(body->>'messageId')::uuid,(body->>'sequence')::bigint);
    when 'exam.published' then perform app.project_examination(source,e.aggregate_id,body);
    when 'result.published' then perform app.project_result_batch(source,e.aggregate_id,body);
    when 'enrollment.stop_requested','enrollment.stop_withdrawn','enrollment.stop_approved','enrollment.stop_rejected' then
      select s.* into entry from app.enrollment_stop s where s.id=e.aggregate_id and s.student_id=child
        and s.requester_id=(body->>'requesterId')::uuid and s.revision>=revision_key;
      if not found then return true; end if;
      if app.communication_guardian_current(entry.requester_id,entry.student_id) then
        perform app.materialize_school_notice(source,entry.requester_id,'guardian','stop:'||entry.id||':'||revision_key,
          'fee_stop_changed','school',entry.id,revision_key,jsonb_build_array(app.communication_target('fee_stop',entry.id)),false,true);
      end if;
      for entry in select j.id from app.invoice j join app.enrollment_stop s on s.id=e.aggregate_id and s.student_id=j.student_id
        where j.period<@daterange(s.start_month,s.end_month,'[)') order by j.id
      loop perform app.refresh_invoice_reminders(entry.id,source); end loop;
    when 'invoice.issued' then
      select j.payer_account_id into recipient from app.invoice j where j.id=e.aggregate_id and j.student_id=child
        and j.payer_account_id=(body->>'payerId')::uuid and j.revision>=revision_key;
      if recipient is not null and app.communication_invoice_current(e.aggregate_id,recipient) then
        perform app.materialize_school_notice(source,recipient,'guardian','invoice:'||e.aggregate_id||':issued',
          'invoice_issued','finance',e.aggregate_id,revision_key,jsonb_build_array(app.communication_target('invoice',e.aggregate_id)),true,true);
      end if;
      perform app.refresh_invoice_reminders(e.aggregate_id,source);
    when 'payment.recorded','payment.reversed' then perform app.project_finance_posting(source,e.aggregate_id,body,e.type='payment.reversed');
    when 'finance.stop_review_resolved' then perform app.refresh_invoice_reminders((body->>'invoiceId')::uuid,source);
    when 'finance.stop_refund_recorded' then
      select p.id as receipt_key,p.payer_id into entry from app.stop_cash_refund f
        join app.stop_review r on r.id=f.review_id join app.invoice j on j.id=r.invoice_id
        join app.payer_receipt p on p.receipt_id=f.receipt_id and p.payer_id=j.payer_account_id
        where f.id=e.aggregate_id and j.student_id=child and app.communication_guardian_current(p.payer_id,j.student_id);
      if found then perform app.materialize_school_notice(source,entry.payer_id,'guardian','refund:'||e.aggregate_id,
        'payment_reversed','finance',entry.receipt_key,null,jsonb_build_array(app.communication_target('receipt',entry.receipt_key)),false,true); end if;
    else null;
  end case;
  return true;
end
$$;

create function app.consume_notification_event(target uuid,valid boolean) returns text
language plpgsql volatile security definer set search_path=pg_catalog
as $$
declare event_key uuid;
declare done boolean;
declare result text;
declare issue text;
begin
  select e.id into event_key from app.outbox_event e where e.id=target and app.communication_event_type(e.type) for update;
  if event_key is null then return 'ignored'; end if;
  insert into app.notification_projection(event_id,state) values(target,'pending') on conflict do nothing;
  select p.state into result from app.notification_projection p where p.event_id=target for update;
  if result<>'pending' then return result; end if;
  if not valid then
    update app.notification_projection set state='invalid',issue_key='invalid_payload',finished_at=now() where event_id=target;
    return 'invalid';
  end if;
  begin
    done:=app.project_communications(target);
    if done then
      update app.notification_projection set state='projected',issue_key=null,finished_at=now() where event_id=target;
      return 'projected';
    end if;
    update app.notification_projection set issue_key=null,next_at=now(),attempts=0 where event_id=target;
    return 'pending';
  exception when others then
    get stacked diagnostics issue=returned_sqlstate;
    update app.notification_projection p set attempts=p.attempts+1,issue_key=issue,
      next_at=now()+make_interval(secs=>least(1800,(15*power(2,least(p.attempts,7)))::integer))
    where p.event_id=target;
    return 'retry';
  end;
end
$$;


create or replace function app.delivery_job_current(job app.delivery_job) returns boolean
language plpgsql stable security definer set search_path=pg_catalog
as $$
declare template_key text:=job.context->>'template';
declare notice app.notification%rowtype;
begin
  if not app.communication_account_current(job.recipient_id,job.recipient_persona) then return false; end if;
  if job.kind='broadcast' then return app.broadcast_recipient_locale(job.scope_id,job.recipient_id) is not null; end if;
  select * into notice from app.notification n where n.id=job.notice_id and n.recipient_id=job.recipient_id
    and n.recipient_persona=job.recipient_persona;
  if not found or notice.superseded_at is not null then return false; end if;

  case template_key
    when 'human_message' then
      if not app.communication_thread_current(job.scope_id,job.recipient_id,job.recipient_persona) then return false; end if;
      if job.channel='push' then
        return (job.context->>'sequence')::bigint>coalesce((select r.read_through from app.thread_reader r where r.thread_id=job.scope_id
          and r.account_id=job.recipient_id and r.persona=job.recipient_persona),0);
      end if;
      return exists(select 1 from app.chat_unread_episode e
        cross join lateral app.first_unread_human(e.thread_id,e.account_id,e.persona) u
        where e.job_id=job.id and e.first_sequence=u.sequence and e.first_at=u.created_at and e.first_at+interval '48 hours'<=now());
    when 'child_linked' then return exists(select 1 from app.child_link l join app.guardian_profile g on g.id=l.guardian_id
      where l.id=job.scope_id and l.revision=job.source_revision and l.state='approved' and g.account_id=job.recipient_id
        and app.communication_guardian_current(job.recipient_id,l.student_id));
    when 'arrival_confirmed' then return exists(select 1 from app.attendance_row r where r.id=job.scope_id and r.revision=job.source_revision
      and r.confirmed_arrival_at is not null and app.communication_guardian_current(job.recipient_id,r.student_id));
    when 'attendance_unexcused','attendance_corrected' then
      return app.communication_attendance_current(job.scope_id,job.source_revision,template_key='attendance_unexcused') and exists(
        select 1 from app.absence_follow_up p join app.attendance_row r on r.id=p.row_id
        where p.id=(job.context->>'absenceId')::uuid and p.notice_id=notice.id and p.corrected_at is null
          and app.communication_guardian_current(job.recipient_id,r.student_id));
    when 'exam_scheduled' then
      return exists(select 1 from jsonb_array_elements(notice.targets) t(item) where t.item->>'kind'='exam'
        and app.communication_guardian_current(job.recipient_id,(t.item->>'childId')::uuid)
        and app.communication_exam_current(job.scope_id,(job.context->>'announcementId')::uuid,job.source_revision,(t.item->>'childId')::uuid));
    when 'result_published','result_corrected' then
      return exists(select 1 from app.outbox_event e where e.type='result.published'
        and (e.id=job.event_id or e.payload->>'batchId'=job.context->>'batchId')
        and app.communication_guardian_current(job.recipient_id,(e.payload->>'studentId')::uuid)
        and app.communication_result_current(e.aggregate_id,e.payload) and notice.targets @> jsonb_build_array(
          app.communication_target(e.payload->>'sourceKind',(e.payload->>'sourceId')::uuid,(e.payload->>'studentId')::uuid)));
    when 'fee_stop_changed' then
      return exists(select 1 from app.enrollment_stop s where s.id=job.scope_id and s.requester_id=job.recipient_id
        and s.revision=job.source_revision and app.communication_guardian_current(job.recipient_id,s.student_id));
    when 'invoice_issued' then return app.communication_invoice_current(job.scope_id,job.recipient_id);
    when 'invoice_reminder' then
      return app.communication_invoice_open(job.scope_id,job.recipient_id,job.source_revision) and exists(
        select 1 from app.invoice_reminder r where r.notice_id=notice.id and r.revision=job.source_revision
          and r.school_date=app.school_today());
    when 'payment_recorded' then
      return app.communication_receipt_current(job.scope_id,job.recipient_id) and exists(
        select 1 from app.outbox_event e cross join lateral jsonb_array_elements(e.payload->'items') x(item)
        join app.receipt_allocation a on a.id=(x.item->>'allocationId')::uuid
        where e.id=job.event_id and x.item->>'payerReceiptId'=job.scope_id::text
          and app.communication_guardian_current(job.recipient_id,(x.item->>'studentId')::uuid)
          and not exists(select 1 from app.receipt_reversal q where q.allocation_id=a.id));
    when 'payment_reversed' then return app.communication_receipt_current(job.scope_id,job.recipient_id);
    else return false;
  end case;
end
$$;

create or replace function app.start_mail_submission(target uuid,lease uuid,destination text,language_key text) returns boolean
language plpgsql volatile security definer set search_path=pg_catalog
as $$
declare job record;
declare started uuid;
begin
  select j.kind,j.scope_id into job from app.delivery_job j where j.id=target and j.lease_id=lease and j.state='queued';
  if not found then return false; end if;
  if job.kind='chat_reminder' then perform 1 from app.thread t where t.id=job.scope_id for update;
  elsif job.kind in ('finance','attendance') then perform app.lock_school_calendar(); end if;
  update app.delivery_job j set submitted_at=now() where j.id=target and j.state='queued' and j.channel='email'
    and j.lease_id=lease and j.lease_until>now() and j.submitted_at is null and (
      (j.kind in ('invite_guardian','invite_teacher') and exists (
        select 1 from app.invitation_delivery_input(j.scope_id,j.source_revision) i where i.email=destination and i.locale=language_key
      ))
      or (j.kind not in ('invite_guardian','invite_teacher') and exists (
        select 1 from app.delivery_mail_target(target,lease) m where m.email=destination and m.locale=language_key
      ))
    ) returning j.id into started;
  return started is not null;
end
$$;

create or replace function app.notice_target_visible(target jsonb)
returns boolean language plpgsql stable security definer set search_path=pg_catalog
as $$
declare resource uuid:=(target->>'id')::uuid;
declare child uuid:=(target->>'childId')::uuid;
declare on_date date:=(target->>'date')::date;
begin
  case target->>'kind'
    when 'thread' then return app.thread_can_access(resource);
    when 'broadcast' then return exists(select 1 from app.received_school_broadcasts(resource));
    when 'child' then return app.has_child_link(resource) and exists(select 1 from app.student s where s.id=resource);
    when 'attendance' then return app.has_child_link(child) and (
      exists(select 1 from app.approved_attendance_rows(child,null,on_date,on_date,null,true) r where r.id=resource)
      or exists(select 1 from app.attendance_row r where r.id=resource and r.student_id=child and r.school_date=on_date
        and r.confirmed_arrival_at is not null)
    );
    when 'exam' then return app.has_child_link(child) and exists(select 1 from app.exam_projection(child,null,null,resource));
    when 'evaluation' then return app.has_child_link(child) and exists(select 1 from app.evaluation_projection(child,null,null,resource));
    when 'homework' then return app.has_child_link(child) and exists(select 1 from app.homework_projection(child,null,null,resource));
    when 'activity' then return app.has_child_link(child) and exists(select 1 from app.assessed_activity_rows(child,null,resource));
    when 'invoice' then return app.finance_invoice_visible(resource);
    when 'receipt' then return exists(select 1 from app.receipt_payer_document(resource));
    when 'fee_stop' then return app.enrollment_stop_visible(resource,'read');
    when 'application' then return exists(select 1 from app.teacher_application a where a.id=resource and a.applicant_id=app.actor_account());
    else return false;
  end case;
end
$$;

create or replace function app.my_application(subject uuid,auth_session uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog
as $$
declare owner uuid;
begin
  owner:=app.applicant_identity(subject,auth_session,false);
  if owner is null then raise exception 'Invalid applicant session' using errcode='42501'; end if;
  return (select app.application_view(a)||jsonb_strip_nulls(jsonb_build_object('decisionNotice',(
    select jsonb_build_object('id',n.id,'createdAt',app.utc_iso(n.created_at)) from app.notification n
    where n.recipient_id=owner and n.recipient_persona='applicant' and n.template_key='application_decided'
      and n.logical_key='application:'||a.id||':'||a.revision
  ))) from app.teacher_application a where a.applicant_id=owner);
end
$$;

create function app.notification_projection_metrics()
returns table(retry_count integer,invalid_count integer,oldest_lag_seconds integer)
language sql stable security definer set search_path=pg_catalog
as $$
  select (select count(*)::integer from app.notification_projection p where p.state='pending' and p.issue_key is not null),
    (select count(*)::integer from app.notification_projection p where p.state='invalid'),
    coalesce((select greatest(0,extract(epoch from now()-e.occurred_at)::integer) from app.outbox_event e
      left join app.notification_projection p on p.event_id=e.id where app.communication_event_type(e.type)
        and (p.event_id is null or p.state='pending') order by e.occurred_at,e.id limit 1),0)
$$;

revoke all on function app.communication_event_type(text),app.pending_notification_events(integer),
  app.communication_account_current(uuid,text),app.communication_guardians(uuid),app.communication_guardian_current(uuid,uuid),
  app.communication_locale(uuid),app.communication_thread_current(uuid,uuid,text),app.communication_target(text,uuid,uuid,date),
  app.materialize_school_notice(uuid,uuid,text,text,text,text,uuid,integer,jsonb,boolean,boolean,jsonb),
  app.communication_invoice_current(uuid,uuid),app.communication_invoice_open(uuid,uuid,integer),app.communication_receipt_current(uuid,uuid),
  app.communication_result_current(uuid,jsonb),app.communication_exam_current(uuid,uuid,integer,uuid),
  app.communication_attendance_current(uuid,integer,boolean),app.first_unread_human(uuid,uuid,text),
  app.suppress_unsent_delivery(uuid),app.refresh_chat_episode(uuid,uuid,text,uuid),app.refresh_episode_after_read(),
  app.sweep_chat_episodes(integer),app.refresh_invoice_reminders(uuid,uuid),app.materialize_due_invoice_reminders(integer),
  app.absence_case_thread(uuid,uuid),app.publish_absence_message(uuid,uuid,integer,uuid,text,uuid),
  app.project_attendance_follow_up(uuid,uuid,jsonb,boolean),app.materialize_absence_corrections(integer),
  app.project_broadcast(uuid,uuid),app.project_human_chat(uuid,uuid,uuid,bigint),app.project_examination(uuid,uuid,jsonb),
  app.project_result_batch(uuid,uuid,jsonb),app.project_finance_posting(uuid,uuid,jsonb,boolean),app.project_communications(uuid),
  app.consume_notification_event(uuid,boolean),app.notification_projection_metrics()
from public,anon,authenticated,service_role;
grant execute on function app.pending_notification_events(integer),app.consume_notification_event(uuid,boolean),
  app.sweep_chat_episodes(integer),app.materialize_due_invoice_reminders(integer),app.materialize_absence_corrections(integer),
  app.notification_projection_metrics()
to app_delivery_worker;


create or replace function app.delivery_push_devices(target uuid,lease uuid)
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
    and (job.context->>'originalJobId' is null or exists(select 1 from app.push_delivery_attempt origin
      where origin.job_id=(job.context->>'originalJobId')::uuid and origin.installation_id=d.installation_id
        and origin.device_guard=d.delivery_guard and origin.state='accepted'))
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

grant execute on function app.communication_event_type(text) to app_runtime;
