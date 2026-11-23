# Family-first and direct staff provisioning Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Follow RED → GREEN per task.
**Goal:** Complete family-first admission and secure direct Admin/Lehrkraft provisioning with no duplicated invitation/admin flows.
**Architecture:** Transactional family service wraps existing guardian/student/link/enrollment schema; secure Admin-only server provisioning wraps Supabase Auth Admin API and protected DB role grant. Existing invite sender supports guardian only.
**Tech Stack:** Next.js, React, TypeScript, Zod, Postgres/Supabase Auth, Playwright.
**Spec:** docs/superpowers/specs/2026-11-23-family-first-staff-provision-design.md
## Global Constraints
- No unrelated page redesign; preserve current records and enrollment history.
- Hauptadmin immutable account from current live identity, not dynamically email-matched.
- Parents still receive invitation; staff do not.
- No client-side service role or password persistence.
## Review Focus
- Partial transaction failure and duplicate retries must not create orphan students.
- Unplaced children must be allowed and must not appear in class attendance.
- Unauthorized Admin creation/role elevation/deactivation attempts must fail server side.
- Teacher profile must be linked to ready-to-login Auth account before assignment.
- Existing guardian links/invitations and family import still function.
### Task 1: Atomic family endpoints and validation
Files: contracts school/families.ts, school/families.ts, app/api/v1/school/families routes, qa tests.
- [ ] RED: tests for payload validation and authorized atomic operation.
- [ ] GREEN: transactionally create guardians+children+links+optional enrollments with classroom date/capacity checks.
- [ ] Verify classless and multi-child cases; prevent standalone student POST.
### Task 2: Family-centered web UI
Files: features/school/Families.tsx and new-family form, school/[tab]/page.tsx.
- [ ] RED: Playwright family navigation/creation expectations.
- [ ] GREEN: New family form, child rows & optional class, reuse existing detail/update, remove standalone creation.
- [ ] Verify mobile and Arabic/German.
### Task 3: Guardian invitation consolidation
Files: identity/Invitations.tsx, school/Families.tsx, FamilyImport.tsx, school/[tab]/page.tsx, invitations route.
- [ ] RED: test no navigation to staff/teachers invite; guardian invite remains reachable from family.
- [ ] GREEN: redirect obsolete invitation workspace to family, add invite state/actions there and import bulk link.
- [ ] Verify parent invite delivery and independent existing account joining still work.
### Task 4: Secure direct staff provisioning
Files: new contracts, identity service, API route, DB migration for protected identity creation, StaffAssignments.tsx.
- [ ] RED: auth, principal-only guard, role validity, password validation tests.
- [ ] GREEN: Auth Admin createUser + DB profile/role integration; compensating rollback and no password logging.
- [ ] Verify teacher account can be selected for teaching assignment; admin cannot mint another admin.
### Task 5: Permissions hardening and navigation
Files: access SQL migration, StaffAccess.tsx, server/access/capabilities.ts, Shell menu, QA tests.
- [ ] RED: principal account and nonprincipal privilege-escalation tests.
- [ ] GREEN: enforce Hauptadmin-only admin grant creation/removal and protection; update labels/roles.
- [ ] Verify build, lint, TypeScript, Playwright and DB migration.
### Task 6: Finish and review
- [ ] Record actual test outputs, inspect diff, PR to main on isolated branch, do not merge on red CI.
