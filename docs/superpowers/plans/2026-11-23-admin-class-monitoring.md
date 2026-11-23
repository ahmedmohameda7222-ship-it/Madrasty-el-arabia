# Admin Class Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A class-list-first administrative monitoring experience with a complete read-only class dashboard and published-only student performance profile.

**Architecture:** Preserve the existing school and teacher write workflows. Introduce role-restricted SQL read projections in private `app` schema and scoped Next.js API handlers, plus dedicated Admin list/class/student React screens using existing dark tokens. Inspect published record tables and never serialize working drafts. The base SQL functions are owned by postgres but callable only by `app_runtime` and guard persona/capabilities inside the function, as existing app functions do.

**Tech Stack:** pnpm/Next.js/React/TypeScript/Zod, PostgreSQL in Supabase, node:test fixtures and Playwright.

**Spec:** `docs/superpowers/specs/2026-11-23-admin-class-oversight-design.md`

## Global Constraints
- Owner approved class list first -> dashboard for one class -> student profile; no school-wide dashboard.
- Teacher and parent workflows unchanged; Admin cannot write attendance, exam marks, homework, evaluations or teaching logs.
- Admin sees **only approved attendance, announced exams, published grades and evaluation publications, visible homework/activity marks, recorded teaching log entries**; never private drafts, unpublished corrections, or private_reason.
- Keep Admin administrative functions in distinct existing navigation; don't remove school/enrollment/teacher management.
- Small volunteer school, one Lehrkraft role; simple Arabic (RTL) and B1 German (LTR), mobile-first, dark non-neon UI.
- No production SQL writes during test development. Only consider applying migration after full CI and an explicit release decision.

## Review Focus
- Draft exam + result not yet published must not appear in raw Admin GET payload, even with crafted class/student ID.
- Teacher evaluation draft and unpublished correction cannot reveal text or scores via raw GET; approved/latest publication appears only once.
- Open attendance sheet's per-student rows remain invisible until teacher approval, while approved absences/lateness show with dates.
- Historic/closed school year and moved students must keep correct class/year scope and date-bound membership, without cross-class leakage.
- Direct Admin POST/PATCH to teaching/attendance/grades remain 403/404; teacher and guardian access are unchanged.

---

### Task 1 — Private published-only SQL monitoring projections

**Files:** Create `supabase/migrations/20261123072000_admin_class_monitoring.sql`; Test `qa/academics/admin-class-monitoring.test.ts`.

**Interfaces:**
- `app.admin_monitor_classes(p_year uuid)` -> TABLE of `classId,yearId,code,nameAr,nameDe,teacherName,studentCount,lastAttendanceDate`.
- `app.admin_class_monitor(p_class uuid)` -> JSONB with class context, students, latest approved attendance, officially announced exams, official homework/activities, published evaluations and recorded teaching entries.
- `app.admin_student_monitor(p_class uuid,p_student uuid)` -> JSONB student profile with approved attendance and only published academic outcomes.

- [ ] RED: integration test requests new endpoint and receives 404, not a class list or profile.
- [ ] GREEN: SQL functions with internal persona/capability checks; explicit REVOKE from public/anon/authenticated and GRANT only to app_runtime. No draft fields or hidden corrections selected; all identifiers scoped by class/year.
- [ ] Verify via test fixture migration and QA; commit.

### Task 2 — Read-only API contract, route and scope

**Files:** Create `packages/contracts/src/school/class-monitor.ts`, update `packages/contracts/src/index.ts`, create `apps/web/src/server/school/class-monitor.ts`, routes under `apps/web/src/app/api/v1/school/monitor/classes/**/route.ts`; Test Task 1 fixture.

**Interfaces:**
- `GET /api/v1/school/monitor/classes?yearId=...` array of `adminMonitorClass`.
- `GET /api/v1/school/monitor/classes/:classId` `adminMonitorDashboard`.
- `GET /api/v1/school/monitor/classes/:classId/students/:studentId` `adminMonitorStudent`.
- All GET-only, no mutation; class/student UUID validation; `withActor` and non-teacher authorization, Zod response parsing.

- [ ] RED: extend integration tests to query draft privacy and cross-class lookup.
- [ ] GREEN: implement strictly shaped DTOs and server handlers; domain suite green.
- [ ] Verify `pnpm qa:academics`, `pnpm check:types`; commit.

### Task 3 — Admin class list landing and class dashboard

**Files:** Create `apps/web/src/features/school/AdminClassMonitor.tsx` and `AdminClassMonitor.module.css`; replace Admin monitor route `apps/web/src/app/[locale]/school/more/oversight/page.tsx`; Test `qa/web/ui-admin-oversight.spec.ts`.

**Interfaces:** Admin sees list/search/year first, then one class dashboard with roster, approved attendance, announced exams, visible homework/activities, published evaluations and recorded teaching sections. Existing `classes` management route remains admin configuration. In-page back restores year/class selection.

- [ ] RED: UI test first asserts 'Klassen' list before dashboard; drill into selected class then see read-only sections. 
- [ ] GREEN: implement responsive bilingual class-list + class dashboard on new GET APIs, no teacher editing affordances.
- [ ] Verify Chromium, TypeScript and build; commit.

### Task 4 — Student profile with historical, official-only outcomes

**Files:** Extend `AdminClassMonitor.tsx`, CSS and `qa/web/ui-admin-oversight.spec.ts`; optional focused helper component if needed.

**Interfaces:** Click a student within chosen class, show dated approved attendance and published exam/homework/activity marks/evaluations; no missing-result-as-zero, and no leakage from other class.

- [ ] RED: E2E test expects student profile, approved-only notes/results and safe empty state; class/year preserved on back.
- [ ] GREEN: Student Profile responsive UI and simple Arabic/German labels, no ungrounded performance labels.
- [ ] Verify Chromium, Firefox/WebKit, TypeScript; commit.

### Task 5 — Regressions and release readiness

**Files:** Add safeguards to `qa/academics/admin-class-monitoring.test.ts`; update `qa/web/ui-admin-oversight.spec.ts`, documentation as needed.

- [ ] Run full CI on **exact** PR head: domain, fixture + browser Chromium, cross-platform Firefox/WebKit, web build, dashboard, Android.
- [ ] Review source data privacy, migration history ordering, production DB compatibility and SQL grants.
- [ ] Open Draft PR for owner preview; no merge, deployment or SQL application until all checks pass and user authorizes release.
