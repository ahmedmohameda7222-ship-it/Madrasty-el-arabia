create index pending_child_link_work_idx on app.child_link (id,created_at) where state = 'pending';
create index open_family_import_work_idx on app.family_import_job (owner_id,id,created_at) where state <> 'committed';

create function app.work_queue_items(queue text, as_of date)
returns table(id uuid, title_ar text, title_de text, detail_ar text, detail_de text, target jsonb)
language sql stable security invoker set search_path = pg_catalog
as $$
  select l.id, g.display_name,g.display_name,s.display_name,s.display_name,
    jsonb_build_object('kind','guardian_link','guardianId',g.id,'linkId',l.id)
  from app.child_link l join app.guardian_profile g on g.id = l.guardian_id join app.student s on s.id = l.student_id
  where queue = 'guardian_links' and app.has_capability('students.manage') and l.state = 'pending' and s.state = 'active'
    and l.created_at < ((as_of + 1)::timestamp at time zone
      (select w.timezone from app.timetable_week_info(as_of) w))
  union all
  select j.id,j.file_name,j.file_name,
    case j.state when 'review' then 'بانتظار المراجعة' else 'بانتظار مطابقة الأعمدة' end,
    case j.state when 'review' then 'Zur Prüfung' else 'Spalten zuordnen' end,
    jsonb_build_object('kind','family_import','jobId',j.id)
  from app.family_import_job j
  where queue = 'family_imports' and app.has_capability('students.manage') and j.owner_id = app.actor_account()
    and j.state <> 'committed' and j.expires_at > now()
    and j.created_at < ((as_of + 1)::timestamp at time zone
      (select w.timezone from app.timetable_week_info(as_of) w))
  union all
  select c.id, c.code || ' · ' || c.name_ar,c.code || ' · ' || c.name_de,
    case when missing.primary_staff and missing.subject_staff then 'ينقص مسؤول حضور ومدرس مادة'
         when missing.primary_staff then 'ينقص مسؤول حضور' else 'ينقص مدرس مادة' end,
    case when missing.primary_staff and missing.subject_staff then 'Anwesenheitsverantwortung und Fachunterricht fehlen'
         when missing.primary_staff then 'Anwesenheitsverantwortung fehlt' else 'Fachunterricht fehlt' end,
    jsonb_build_object('kind','class_assignment','classId',c.id,'yearId',y.id)
  from app.school_class c join app.school_year y on y.id = c.year_id
  left join lateral (
    select not exists (
      select 1 from app.teaching_assignment t
      join app.staff_profile p on p.id=t.staff_id
      join app.staff_accounts() staff on staff.account_id=p.account_id and 'teacher'=any(staff.roles)
      where t.class_id=c.id and t.kind='primary' and t.revoked_at is null
        and as_of>=t.effective_from and as_of<t.effective_until
        and p.disabled_at is null and as_of>=p.active_from and (p.active_until is null or as_of<p.active_until)
        and 'attendance.mark'=any(t.capabilities)
    ) as primary_staff,
    not exists (
      select 1 from app.teaching_assignment t
      join app.staff_profile p on p.id=t.staff_id
      join app.staff_accounts() staff on staff.account_id=p.account_id and 'teacher'=any(staff.roles)
      where t.class_id=c.id and t.kind='subject' and t.revoked_at is null
        and as_of>=t.effective_from and as_of<t.effective_until
        and p.disabled_at is null and as_of>=p.active_from and (p.active_until is null or as_of<p.active_until)
    ) or exists (
      select 1 from app.class_subject o where o.class_id=c.id and not exists (
        select 1 from app.teaching_assignment t join app.staff_profile p on p.id=t.staff_id
        join app.staff_accounts() staff on staff.account_id=p.account_id and 'teacher'=any(staff.roles)
        where t.offering_id=o.id and t.revoked_at is null and as_of>=t.effective_from and as_of<t.effective_until
          and p.disabled_at is null and as_of>=p.active_from and (p.active_until is null or as_of<p.active_until)
      )
    ) as subject_staff
  ) missing on true
  where queue='class_assignments' and app.staff_editor() and y.state='active'
    and as_of>=y.starts_on and as_of<y.ends_exclusive and (missing.primary_staff or missing.subject_staff)
$$;

revoke all on function app.work_queue_items(text,date) from public,anon,authenticated,service_role;
grant execute on function app.work_queue_items(text,date) to app_runtime;
