# Family-first enrollment and direct staff provisioning — 2026-11-23
## Intent
Madrasty El Arabia must have a single family-centered workflow for student admission and direct account creation for two staff roles (Lehrkraft, Admin). Retain parent invitations only.
## Accepted product decisions
- Hauptadmin is the existing account madrastyelarabia@hotmail.com; only this exact account can create Admins or grant/administer Admin authority.
- Admins with teaching/staff management permission can create Lehrkräfte, with email/password entered in app. No teacher/admin invite.
- Create a family with at least one guardian and at least one child in one atomic save; optional second guardian. Children may be assigned an existing school class individually during family creation or remain unplaced.
- Existing families can add another child without opening a standalone student-creation flow.
- Parent invitations live within family records; retain reissue and batch issuance from import, without standalone Einladungen/Elternzugänge navigation.
- Preserve current students/guardians, historical enrollments, teaching assignments, admin/teacher accounts, and recovery/security.
- UI Arabic and German, mobile-first, small steps, no unrelated redesign.
## Design approaches
1. **Selected: retain underlying records, combine server operations** — new transactional family endpoints and secure staff provisioning, existing roster/guardian/invitation records unchanged. Lowest migration risk.
2. Full replacement of student/guardian database entities with a new family entity — rejected because existing attendance, finance, messaging reference existing identifiers.
3. Only combine frontend POSTs — rejected because partial saves could orphan students and guardians.
## Security/authorization
Use Supabase Auth Admin API exclusively server-side; never store plaintext password. Validate actor via existing withActor security context. Resolve Hauptadmin by immutable verified account UUID, not by arbitrary displayed email or caller-supplied role. Admin accounts require current MFA before elevated operations. Protect against non-Hauptadmin admin role elevation and disabling original Hauptadmin. Guardian invite links continue through existing secure invite service.
## API contract
- POST /api/v1/school/families: guardians[1..2], children[1..n] each {displayName,classId?:uuid|null}; transactionally create guardian records, students, approved links, optional effective enrollment.
- POST /api/v1/school/families/:guardianId/children: create child, link to guardian, optional class placement.
- POST /api/v1/staff/provision: {role:'teacher'|'admin',name,email,password,phone?,capabilities?}. Provision provider auth user plus account, role grant, staff profile. Recover auth user if DB transaction fails.
## Acceptance checks
No standalone create-student button or reachable POST student create; family creation allows missing class, multiple children and different classes; parent invites still work through guardian; teacher accounts are assignable; Admin provisioning and role elevation require Hauptadmin; no password stored in DB; tests/CI/build clean.