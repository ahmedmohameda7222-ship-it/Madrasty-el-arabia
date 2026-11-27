-- Retire the school-facing audit and manual delivery-management features.
-- Keep immutable audit storage, finance records, provider reconciliation,
-- automatic notification delivery, and normal invitation/broadcast flows.
-- Dashboard projections contain identifiers and operational labels only.
create or replace function app.dashboard_work_queue_items(queue text, as_of date)
returns table(id uuid, title_ar text, title_de text, detail_ar text, detail_de text, target jsonb)
language sql stable security definer set search_path = pg_catalog
as $$
  with boundary as (
    select ((as_of + 1)::timestamp at time zone w.timezone) as ends_at
    from app.timetable_week_info(as_of) w
    where app.actor_persona() = 'admin' and app.guard_actor()
  )
  select i.id, 'دعوة تعذّر تسليمها', 'Nicht zugestellte Einladung',
    case i.kind when 'guardian' then 'ولي أمر' else 'مدرس' end,
    case i.kind when 'guardian' then 'Familie' else 'Lehrkraft' end,
    jsonb_build_object('kind','bounced_invite','invitationId',i.id)
  from app.invitation i cross join boundary b
  where queue='bounced_invites' and i.delivery='bounced'
    and i.validity in ('pending','expired') and i.expires_at - interval '24 hours' < b.ends_at
    and ((i.kind='guardian' and app.has_capability('students.manage'))
      or (i.kind='teacher' and app.has_capability('staff.invite')))
  union all
  select a.id,c.code || ' · ' || c.name_ar,c.code || ' · ' || c.name_de,
    a.school_date::text,a.school_date::text,
    jsonb_build_object('kind','attendance_sheet','classId',a.class_id,'date',a.school_date)
  from app.attendance_sheet a join app.school_class c on c.id=a.class_id cross join boundary
  where queue='unapproved_attendance' and app.has_capability('attendance.supervise')
    and a.state='open' and a.school_date<=as_of and app.attendance_open_for_writes(a.class_id,a.school_date)
  union all
  select s.id,s.student_name,s.student_name,'طلب قيد للمراجعة','Teilnahmepause zur Prüfung',
    jsonb_build_object('kind','enrollment_stop','requestId',s.id)
  from app.enrollment_stop_rows(null,null,'pending') s cross join boundary b
  where queue='noncontinuation_requests' and s.can_decide and s.created_at<b.ends_at
  union all
  select r.id,r.receipt_number,r.receipt_number,'مبلغ يحتاج مطابقة','Zahlung abgleichen',
    jsonb_build_object('kind','receipt_match','receiptId',r.id)
  from app.finance_receipt r
  cross join lateral app.receipt_money(r.id,'infinity'::timestamptz) m
  cross join boundary b
  where queue='settlement_review' and app.finance_receipt_staff()
    and not m.voided and m.remainder_minor>app.finance_refunded_minor(r.id,'infinity'::timestamptz) and r.recorded_at<b.ends_at

$$;
revoke all on function app.dashboard_work_queue_items(text,date) from public,anon,authenticated,service_role;
grant execute on function app.dashboard_work_queue_items(text,date) to app_runtime;

