# Admin oversight must be read-only — 2026-11-23

## Intent
Administrators are administrative supervisors; they are not a class teacher, not an examiner, not a grader, and do not enter teaching evidence. Lehrkräfte are the only teaching actors, scoped to their own active assignments. Admins monitor attendance, exams, lesson activity and grading progress, and organize accounts, classes and teacher assignments.

## Invariants
- A teaching assignment is for an active teacher persona only; Admins cannot become class teacher via staff records.
- Admin: read attendance and academic evidence if granted `attendance.supervise` and/or `academics.supervise`; cannot create, grade, publish, approve, mark or alter those evidence records, including with direct API requests.
- Teacher: academic and attendance edits only in their assigned class/subject and capability scope.
- Admin may still set up school years, classes, subject catalog metadata, timetable, teacher accounts and classroom assignments (administrative configuration, not teaching evidence).
- Read-only admin supervision workspace is one simple flow: pick school day -> inspect classes -> open class details with teacher, attendance status, teaching activity and exams/homework. No duplicate grading/marking UI.
- Arabic/German and mobile support; no neon or decorative icons; preserve record history and confidentiality.
- Admin denial must be enforced by server-side API and Postgres SECURITY DEFINER guards; view-only buttons are insufficient.
- Approved-attendance correction and calendar cancellation workflows must not silently allow admin to change a pupil's teaching record; exceptions need a dedicated audited teacher-led correction workflow, not implicit Admin edit.

## Approach
Keep existing data model, capabilities and role/persona grants, but separate read scope from write scope in Postgres SQL functions; add a strictly read-only server endpoint for aggregated supervision, and a compact admin-specific UI. Avoid changing teacher editing functionality or parent visibility.

## Acceptance
Existing teacher exams and attendance writes work; Admin can view the same records with all `canEdit/canMark/canPublish` flags false and receives 403/404 for write routes; Admin can still manage class/teacher assignment; oversight metrics are scoped by granted capability; history, students and guardians unchanged.
