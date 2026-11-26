-- Personal communication preferences are scoped by the existing thread reader key.
alter table app.thread_reader add column pinned boolean not null default false,
  add column muted boolean not null default false;
create index thread_reader_pinned on app.thread_reader(account_id,persona,thread_id) where pinned;

create function app.thread_is_muted(target uuid,recipient uuid,role_key text)
returns boolean language sql stable set search_path=pg_catalog
as $$ select coalesce((select r.muted from app.thread_reader r where r.thread_id=target and r.account_id=recipient and r.persona=role_key),false) $$;

create function app.thread_preferences(target uuid)
returns table(pinned boolean,muted boolean)
language sql stable security definer set search_path=pg_catalog
as $$
  select coalesce(r.pinned,false),coalesce(r.muted,false)
  from app.thread t left join app.thread_reader r on r.thread_id=t.id and r.account_id=app.actor_account() and r.persona=app.actor_persona()::text
  where t.id=target and app.thread_can_access(t.id)
$$;

create function app.change_thread_preferences(target uuid,pin_value boolean,mute_value boolean)
returns table(pinned boolean,muted boolean)
language plpgsql security definer set search_path=pg_catalog
as $$
declare actor uuid:=app.actor_account();
declare actor_role text:=app.actor_persona()::text;
begin
  if not app.thread_can_access(target) then raise exception 'Conversation is unavailable' using errcode='42501'; end if;
  perform 1 from app.thread t where t.id=target for update;
  if not found or not app.thread_can_access(target) then raise exception 'Conversation is unavailable' using errcode='42501'; end if;
  insert into app.thread_reader as r(thread_id,account_id,persona,pinned,muted)
  values(target,actor,actor_role,coalesce(pin_value,false),coalesce(mute_value,false))
  on conflict(thread_id,account_id,persona) do update set
    pinned=coalesce(pin_value,r.pinned),muted=coalesce(mute_value,r.muted),updated_at=now();
  if mute_value is true then
    -- Cancel unsent ordinary chat notifications only; do not suppress school,
    -- attendance, finance or broadcast notices or attempt to recall sent jobs.
    perform app.suppress_unsent_delivery(j.id) from app.delivery_job j
      where j.scope_id=target and j.recipient_id=actor and j.recipient_persona=actor_role
        and j.context->>'template'='human_message' and j.state='queued';
    delete from app.chat_unread_episode e where e.thread_id=target and e.account_id=actor and e.persona=actor_role;
  end if;
  return query select p.pinned,p.muted from app.thread_preferences(target) p;
end
$$;

revoke all on function app.thread_is_muted(uuid,uuid,text),app.thread_preferences(uuid),app.change_thread_preferences(uuid,boolean,boolean) from public,anon,authenticated,service_role;
grant execute on function app.thread_preferences(uuid),app.change_thread_preferences(uuid,boolean,boolean) to app_runtime;

create or replace function app.project_human_chat(source uuid,target uuid,message_key uuid,high_water bigint) returns void
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
      'human_message','chat_reminder',target,null,jsonb_build_array(app.communication_target('thread',target)),false,not app.thread_is_muted(target,recipient.account_id,recipient.persona),
      jsonb_build_object('sequence',high_water));
    if not app.thread_is_muted(target,recipient.account_id,recipient.persona) then
      perform app.refresh_chat_episode(target,recipient.account_id,recipient.persona,source);
    end if;
  end loop;
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
      if not app.communication_thread_current(job.scope_id,job.recipient_id,job.recipient_persona) or app.thread_is_muted(job.scope_id,job.recipient_id,job.recipient_persona) then return false; end if;
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
