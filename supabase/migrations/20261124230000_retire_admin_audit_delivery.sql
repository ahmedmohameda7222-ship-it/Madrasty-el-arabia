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
    and not m.voided and m.remainder_minor>0 and r.recorded_at<b.ends_at

$$;
revoke all on function app.dashboard_work_queue_items(text,date) from public,anon,authenticated,service_role;
grant execute on function app.dashboard_work_queue_items(text,date) to app_runtime;

DROP POLICY IF EXISTS audit_read_scoped ON app.audit_entry;
DROP FUNCTION IF EXISTS app.school_audit_projection(date,date,text,uuid,uuid);
DROP FUNCTION IF EXISTS app.audit_resource_link(text,uuid);
DROP FUNCTION IF EXISTS app.audit_scope(text,uuid,jsonb);
DROP FUNCTION IF EXISTS app.redrive_delivery_job(uuid,integer);
DROP FUNCTION IF EXISTS app.delivery_overview();
DROP FUNCTION IF EXISTS app.delivery_can_redrive(app.delivery_job);
DROP FUNCTION IF EXISTS app.may_operate_delivery_queue();
-- may_view_delivery_job is still used by broadcast delivery counts.

-- Remove the retired projection's rule table and indexes; the immutable
-- audit_entry table and its write policy remain available to core workflows.
DROP TABLE app.audit_action_rule RESTRICT;
DROP INDEX IF EXISTS app.audit_entry_actor_time;
DROP INDEX IF EXISTS app.audit_entry_action_time;

-- Existing installations may contain grants for the removed capability.
-- Delete only those obsolete grants, leaving every other grant intact.
DELETE FROM app.capability_grant WHERE capability = 'audit.read';
ALTER TABLE app.capability_grant DROP CONSTRAINT capability_grant_capability_check;
ALTER TABLE app.capability_grant ADD CONSTRAINT capability_grant_capability_check
  CHECK (capability = ANY (ARRAY[
    'school.manage','students.manage','staff.invite','attendance.supervise',
    'academics.supervise','comms.publish','finance.read','finance.issue',
    'finance.post','finance.export','bank.configure'
  ]::text[]));

-- Preserve the current function definitions and their grants, removing only
-- the retired key. Fail the migration if the expected definition has changed.
DO $retire_capability$
DECLARE
  definition text;
  updated text;
  target regprocedure;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'app.has_capability(text)'::regprocedure,
    'app.provision_staff_account(uuid,text,text,text,text,text,text[])'::regprocedure
  ] LOOP
    definition := pg_get_functiondef(target);
    updated := regexp_replace(definition, ',[[:space:]]*''audit\.read''', '', 'g');
    IF definition = updated OR strpos(updated, '''audit.read''') > 0 THEN
      RAISE EXCEPTION 'Unexpected audit capability definition in %', target;
    END IF;
    EXECUTE updated;
  END LOOP;
END
$retire_capability$;
