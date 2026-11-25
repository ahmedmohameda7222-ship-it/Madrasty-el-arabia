# Family Management Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans, batch implementation before consolidated verification as requested.

**Goal:** A simple family-first management workflow on web and native Android with independent access for each child.
**Architecture:** Add office-only organizational family records/memberships without replacing existing child_link or finance payer versions. Extend existing transaction APIs compatibly; use shared contracts and scoped API for both clients.
**Tech Stack:** PostgreSQL/Supabase, Next.js/React, Zod, Jetpack Compose, Playwright.
**Spec:** docs/superpowers/specs/2026-11-25-family-management-design.md

## Global constraints
No implicit grants from marital status or membership. No automatic merge of legacy households. Preserve existing enrollment and finance authorization, idempotency, revisions, invitation confirmation, CSV/XLSX compatibility, Arabic RTL/German LTR, mobile touch targets and existing app modules.

## Tasks
- [ ] 1. Family entity/member RLS migration; existing records unchanged; test office-only access.
- [ ] 2. Extend family creation transaction for explicit child-specific links and role metadata; test asymmetric access, invalid indexes and replay.
- [ ] 3. Family group directory/detail endpoints, legacy reconciliation and explicit membership editing; stable sorting/search/paging.
- [ ] 4. Student directory class/status filters and detail/profile changes.
- [ ] 5. Web family list and five-step wizard with separate details, verified selection, optional existing people and per-child payer via existing finance API.
- [ ] 6. Android family-first wizard, lists, details and import parity.
- [ ] 7. Import staging/resume, legacy template compatibility, explicit family keys, row conflict filters and receipt recovery.
- [ ] 8. Test privacy, separation, duplicate prevention, stale revision, failed enrollment rollback, no implicit access, finance scope.
- [ ] 9. WebKit/Chromium 320/390/430 and Android emulator Arabic/German light/dark screenshots; inspect actual PNGs.
- [ ] 10. Consolidated CI, exact-head squash merge, migration/deployment verification.

## Implementation ledger
- Coding batches through beced34 added group schema, explicit relationship APIs, office directory, Web and Android wizards, and staged imports.
- Added optional external family key/name, new CSV template, native member creation and directory filters. Legacy XLSX/CSV mappings remain valid; groups only originate from explicit keys, never surname/email inference.
- Ruling: legacy creation callers retain their original explicit registration semantics; modern callers supply child-specific links. Group membership never grants child access.
- Verification: branch CI enabled only after batched changes; no task marked complete without evidence.
