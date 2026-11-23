# Admin Oversight Read-only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Separate Admin supervision from Lehrkraft teaching actions and give Admin a clear, read-only class overview.

**Architecture:** Existing Postgres functions use supervisor capability for read, teacher_scope for writes. New safe aggregated `app.admin_class_oversight(date)` function is exposed through authenticated GET API. A compact mobile-first view replaces admin teaching action navigation.

**Tech Stack:** Next.js, React, TypeScript/Zod, PostgreSQL, Supabase, Playwright.

**Spec:** docs/superpowers/specs/2026-11-23-admin-teaching-readonly.md

## Global Constraints
- No changes to real student/guardian/teaching records.
- No direct Admin mutation of attendance, marks, exams, homework, evaluations or lesson content.
- Preserve read access, class setup and Lehrer assignment management.
- All checks through actor_context and database grants, not UI hiding alone.

## Review Focus
- Existing Admin with broad `access_administrator` privileges should have no teaching write powers.
- Read-only exams, lesson and homework projections must remain accessible to authorized Admins.
- Attendance change and approved-attendance correction cannot bypass checks.
- Capability-limited Admin must not see unrelated counts or PII.
- Teacher editing and parent views must not regress.

### Task 1: Test Admin-vs-teacher role separation
Files: qa/academics/admin-supervision.test.ts, qa/web/ui-guided-workflows.spec.ts
- [ ] RED: Admin can currently create an exam / open attendance via supervisor capability.
- [ ] GREEN: Admin teacher-work attempts denied; teacher attempts still succeed.
- [ ] Verify lesson and exam detail flags are read-only for Admin.

### Task 2: Harden scope functions without losing read access
Files: supabase/migrations/20261123xxxxxx_admin_oversight_readonly.sql
- [ ] Make app.academic_offering_scope(..., NULL) Admin supervisory read or Teacher assignment read, non-null teacher only.
- [ ] Make app.attendance_scope(read) permit supervisor, mark/approve teacher only.
- [ ] Adjust exam/homework/evaluation null read scopes and teaching log/activity read projections.
- [ ] Validate any remaining direct Admin write paths, including correction exceptions.
- [ ] Run full local DB QA with synthetic data and no Production DDL.

### Task 3: Aggregate supervision API
Files: migration function app.admin_class_oversight(date), contracts school/oversight.ts, server/school/oversight.ts, api/v1/school/oversight/route.ts
- [ ] Write negative tests for unauthorized teachers/parents and least-privilege restricted Admin.
- [ ] Implement class+teacher, attendance status, teaching log, homework, exam counts.
- [ ] Match class school-year boundaries and avoid PII in aggregates.

### Task 4: Admin-specific monitoring workspace
Files: features/school/AdminTeachingOverview.tsx and .module.css, app/[locale]/school/more/oversight/page.tsx, school/[tab]/page.tsx
- [ ] RED: UI test Admin sees overview, not grading action navigation.
- [ ] GREEN: date/class filter, class rows/status, drill-down read-only screens.
- [ ] Verify Arabic, German, responsive and dark; teacher navigation remains unchanged.

### Task 5: Ship gate
- [ ] TypeScript, build, domain/privilege tests, Playwright, Firefox/WebKit, Android unchanged.
- [ ] Inspect SQL migration and RLS/security definer grants.
- [ ] PR review then merge and apply matching migration in production only after green CI.
