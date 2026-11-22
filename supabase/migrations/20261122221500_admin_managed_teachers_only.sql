-- Teacher accounts are created, invited and assigned by school administrators.
-- Remove the obsolete self-application flow without changing staff or invitation tables.
-- Historical migrations are retained for reproducibility; this forward migration retires them.

DO $retire$
DECLARE
  item record;
  definition text;
  start_at integer;
  stop_at integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM app.teacher_application
    WHERE work_contact IS NULL OR work_contact NOT LIKE '%@madrasty.invalid'
  ) THEN
    RAISE EXCEPTION 'Cannot retire historical non-synthetic teacher requests without separate archiving';
  END IF;

  UPDATE app.capability_grant SET capability='staff.invite'
  WHERE capability='applications.manage';

  UPDATE app.audit_action_rule
  SET allowed_capabilities=array_replace(allowed_capabilities,'applications.manage','staff.invite')
  WHERE 'applications.manage'=ANY(allowed_capabilities);

  FOR item IN
    SELECT p.proname,pg_get_functiondef(p.oid) AS source
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='app' AND p.prokind='f' AND p.proname=ANY(ARRAY[
      'has_capability','audit_scope','dashboard_work_queue_items',
      'may_operate_delivery_queue','may_view_delivery_job',
      'communication_event_type','communication_locale','communication_account_current',
      'materialize_school_notice','broadcast_cohort','delivery_mail_target',
      'delivery_push_devices','notice_target_visible','project_communications','staff_accounts'
    ])
    ORDER BY p.proname
  LOOP
    definition:=replace(item.source,'''applications.manage''','''staff.invite''');

    CASE item.proname
      WHEN 'communication_event_type' THEN
        definition:=replace(definition,'''teacher_application.decided'',','');
      WHEN 'communication_locale' THEN
        definition:=replace(definition,
          '(select p.correspondence_locale from app.teacher_application p where p.applicant_id=target),','');
      WHEN 'communication_account_current' THEN
        definition:=replace(definition,
          '(scope=''applicant'' or app.contact_account_active(target,scope))',
          'app.contact_account_active(target,scope)');
      WHEN 'materialize_school_notice' THEN
        definition:=replace(definition,'if push and scope<>''applicant'' then','if push then');
      WHEN 'broadcast_cohort' THEN
        definition:=replace(definition,'i.correspondence_locale,e.correspondence_locale,''ar''',
          'i.correspondence_locale,''ar''');
        definition:=replace(definition,'  left join app.teacher_application e on e.applicant_id=a.id'||chr(10),'');
      WHEN 'delivery_mail_target' THEN
        definition:=replace(definition,'t.correspondence_locale,ta.correspondence_locale,''ar''',
          't.correspondence_locale,''ar''');
        definition:=replace(definition,'  left join app.teacher_application ta on ta.applicant_id=a.id'||chr(10),'');
      WHEN 'delivery_push_devices' THEN
        definition:=replace(definition,'t.correspondence_locale,ta.correspondence_locale,''ar''',
          't.correspondence_locale,''ar''');
        definition:=replace(definition,'  left join app.teacher_application ta on ta.applicant_id=a.id'||chr(10),'');
      WHEN 'notice_target_visible' THEN
        definition:=replace(definition,
          '    when ''application'' then return exists(select 1 from app.teacher_application a where a.id=resource and a.applicant_id=app.actor_account());'||chr(10),'');
      WHEN 'project_communications' THEN
        start_at:=strpos(definition,'    when ''teacher_application.decided'' then');
        stop_at:=strpos(definition,'    when ''family.link_approved'' then');
        IF start_at=0 OR stop_at<=start_at THEN
          RAISE EXCEPTION 'Unexpected school communication event handler structure';
        END IF;
        definition:=substr(definition,1,start_at-1)||substr(definition,stop_at);
      WHEN 'staff_accounts' THEN
        definition:=replace(definition,'t.display_name, e.display_name, a.id::text',
          't.display_name, a.id::text');
        definition:=replace(definition,'  left join app.teacher_application e on e.applicant_id = a.id'||chr(10),'');
      ELSE NULL;
    END CASE;
    IF position('app.teacher_application' IN definition)>0
       OR position('teacher_application.decided' IN definition)>0
       OR position('applications.manage' IN definition)>0
       OR position('''applicant''' IN definition)>0 THEN
      RAISE EXCEPTION 'Legacy application reference still present in function %',item.proname;
    END IF;
    EXECUTE definition;
  END LOOP;
END
$retire$;

DROP FUNCTION IF EXISTS app.my_application(uuid,uuid);
DROP FUNCTION IF EXISTS app.decide_application(uuid,integer,text,text);
DROP FUNCTION IF EXISTS app.submit_application(uuid,uuid,jsonb);
DROP FUNCTION IF EXISTS app.application_view(app.teacher_application);
DROP FUNCTION IF EXISTS app.applicant_identity(uuid,uuid,boolean);
DROP FUNCTION IF EXISTS app.applicant_can_activate(uuid,uuid);
DROP FUNCTION IF EXISTS app.record_applicant_intake(text,text);

DROP TABLE IF EXISTS app.teacher_application RESTRICT;
DROP TABLE IF EXISTS app.applicant_intake RESTRICT;
