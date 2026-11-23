# Volunteer Teacher Single-Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all teacher subtype selection from common small-school workflows; teachers remain fully authorized for their assigned class.

**Architecture:** Keep the existing `primary` Postgres class assignment as the internal representation. Only simplify React forms and their submitted payloads, preserving historical `subject` records and the Admin/Teacher permission separation.

**Tech Stack:** Next.js, React, TypeScript, PostgreSQL, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-23-volunteer-teacher-single-role.md`

## Global Constraints
- No production DB writes or new migration.
- No edits to existing assignment history.
- Admin never gets teacher classroom write scope.
- Keep permanent teacher password and optional class selection.
- Arabic and German interfaces must both remove type distinction.

## Review Focus
- Direct creation of a teacher with a class grants all class teaching permissions.
- A teacher with no class can be created without a phantom assignment.
- An already-assigned class cannot accidentally gain an overlapping leader.
- Legacy subject assignments still display without data loss.
- Subject catalogs and classroom exam logic remain unaffected.

### Task 1 — Direct teacher account
**Files:** `qa/web/ui-guided-workflows.spec.ts`, `apps/web/src/features/school/DirectStaffForm.tsx`
- [ ] RED: E2E test requires no Lehrkraft type or subject controls; existing UI fails.
- [ ] GREEN: drop radio selection + subject input; POST `assignment:{classId,kind:"primary",subjectId:null}`.
- [ ] Verify existing admin and staff provisioning tests and build.

### Task 2 — Assignment inside a class
**Files:** `qa/web/ui-guided-workflows.spec.ts`, `apps/web/src/features/school/ClassTeachersPanel.tsx`
- [ ] RED: E2E demands one simple Lehrkraft control and no class/subject type chooser.
- [ ] GREEN: only create `kind:"primary"` with all class capabilities; disable add when active leader exists.
- [ ] Retain advanced replacement route for legacy assignments.
- [ ] Verify full browser QA with class assignment.

### Task 3 — Advanced legacy surface
**Files:** `apps/web/src/features/school/StaffAssignments.tsx`, maybe its tests.
- [ ] Hide type choice for **new** assignments; default to primary and full permissions.
- [ ] Keep pre-existing subject assignments accessible for historic corrections/extension.
- [ ] Verify domain tests and no authorization bypass.

### Task 4 — Release
- [ ] Full CI: TypeScript, web build, domain, Chromium, Firefox/WebKit, Android.
- [ ] Review diff, open PR; merge into main only if green and user-authorized.
