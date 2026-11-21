# UI remediation — issue and evidence inventory

Source: user-supplied `Madrasty_UI_Implementation_Handoff_2026-11-21(1).zip`, specifically `SOURCE_AUDIT/audit.json`, `SOURCE_AUDIT/REPORT.md`, and nested `SOURCE_AUDIT/evidence.zip`. This source archive is **not committed** to the app and its screenshots are **not approved goldens**.

Verified offline on 2026-11-21: **19 audit issue IDs** (UI-01 through UI-19), **416 manifest entries** (354 baseline + 62 retry), and **416/416 referenced PNG paths** exist in the nested ZIP. The path shown below is relative to `screenshots/` inside the nested evidence ZIP. A representative screenshot per issue does not prove the other affected roles, viewports or UI states.

| Audit ID | Priority | Task | Role/locale | Route | Width | Representative screenshot | Evidence type | Owning component / source | Finding | State |
|---|---|---|---|---|---:|---|---|---|---|---|
| UI-01 | P0 | UIX-06 | guardian-ar | `/ar/school/home` | 390 | `screenshots/baseline/guardian-ar/ar-school-home-390.png` | Screenshot | `apps/web/src/ui/RoleHero.tsx; apps/web/src/app/school.css` | Long child name overflows hero/heading | Open — not verified |
| UI-02 | P1 | UIX-04 | guardian-de | `/de/school/more/homework` | 390 | `screenshots/retry/guardian-de/de-school-more-homework-390.png` | Retry screenshot | `apps/web/src/ui/Shell.tsx:SchoolHeader; apps/web/src/app/school.css` | German header wraps | Open — not verified |
| UI-03 | P1 | UIX-05 | teacher-de | `/de/school/attendance` | 390 | `screenshots/baseline/teacher-de/de-school-attendance-390.png` | Screenshot | `apps/web/src/ui/Shell.tsx:SchoolShell; apps/web/src/app/school.css` | Anwesenheit bottom tab wraps | Open — not verified |
| UI-04 | P1 | UIX-02 | admin-ar | `/ar/directory` | 1280 | `screenshots/baseline/admin-ar/ar-directory-1280.png` | QA screenshot only | `qa/fixtures/school.ts; QA data source` | Synthetic identifiers in display names; not proven in production | Open — not verified |
| UI-05 | P1 | UIX-01 | admin-ar | `/ar/school/more/calendar` | 1280 | `screenshots/baseline/admin-ar/ar-school-more-calendar-1280.png` | Screenshot capture issue | `apps/web/src/ui/AsyncSurface.tsx; qa/web/screenshot-audit.spec.ts` | Capture taken before terminal state | Open — not verified |
| UI-06 | P1 | UIX-01 | admin-ar | `/ar/school/home` | 390 | `screenshots/baseline/admin-ar/ar-home-dark-390.png` | QA overlay | `qa/web/screenshot-audit.spec.ts` | Next.js development overlay in capture | Open — not verified |
| UI-07 | P1 | UIX-07/08 | admin-de | `/de/school/more/exams` | 1280 | `screenshots/baseline/admin-de/de-school-more-exams-1280.png` | Screenshot + source | `apps/web/src/ui/AsyncSurface.tsx; apps/web/src/features/academics/AssessmentScope.tsx` | Generic empty states | Open — not verified |
| UI-08 | P1 | UIX-09 | guardian-ar | `/ar/school/children` | 1280 | `screenshots/baseline/guardian-ar/ar-school-children-1280.png` | Screenshot | `apps/web/src/ui/Shell.tsx:ScopeSheet; guardian children route` | Guardian child context unclear | Open — not verified |
| UI-09 | P1 | UIX-10 | admin-ar | `/ar/school/messages` | 390 | `screenshots/baseline/admin-ar/ar-school-messages-390.png` | Screenshot | `apps/web/src/features/comms/ThreadInbox.tsx; apps/web/src/app/school.css` | Inbox controls overwhelm thread content | Open — not verified |
| UI-10 | P1 | UIX-03 | admin-ar | `/ar/account/sign-in` | 1280 | `screenshots/baseline/admin-ar/ar-account-sign-in-1280.png` | Source; feel unverified | `apps/web/src/app/school.css` | Missing press feedback | Open — not verified |
| UI-11 | P1 | UIX-03 | admin-ar | `/ar/school/messages` | 1280 | `screenshots/baseline/admin-ar/ar-school-messages-1280.png` | Source; device unverified | `apps/web/src/app/school.css` | Mobile tap behavior missing source declarations | Open — not verified |
| UI-12 | P2 | UIX-03 | admin-ar | `/ar/school/more` | 1280 | `screenshots/baseline/admin-ar/ar-school-more-1280.png` | Source | `apps/web/src/app/school.css` | Hover capability and button selection details | Open — not verified |
| UI-13 | P1 | UIX-13 | admin-de | `/de/school/more/assignments` | 1280 | `screenshots/baseline/admin-de/de-school-more-assignments-1280.png` | Source; interaction unverified | `apps/web/src/ui/Shell.tsx:ScopeSheet; apps/web/src/app/school.css` | Bottom sheet open/close needs interaction verification | Open — not verified |
| UI-14 | P2 | UIX-14 | admin-ar | `/ar/school/more` | 1280 | `screenshots/baseline/admin-ar/ar-school-more-1280.png` | Source | `apps/web/src/app/school.css:.more-group` | More disclosure uses entry-only keyframe | Open — not verified |
| UI-15 | P1 | UIX-11 | admin-ar | `/ar/school/students` | 1280 | `screenshots/baseline/admin-ar/ar-school-students-1280.png` | Screenshot | `apps/web/src/app/school.css; page-specific layout` | Desktop content width imbalance | Open — not verified |
| UI-16 | P2 | UIX-12 | admin-ar | `/ar/school/more/finance-reports` | 1280 | `screenshots/baseline/admin-ar/ar-school-more-finance-reports-1280.png` | Screenshot; locale-dependent | `finance-report form/date field` | Native date affordance appears non-localized | Open — not verified |
| UI-17 | P1 | UIX-01 | admin-de | `/de/school/more/timetable` | 1280 | `screenshots/baseline/admin-de/de-school-more-timetable-1280.png` | Source | `apps/web/src/ui/AsyncSurface.tsx; qa/web/screenshot-audit.spec.ts` | Missing route/terminal-state evidence gate | Open — not verified |
| UI-18 | P2 | UIX-15 | admin-ar | `/ar/school/more` | 1280 | `screenshots/baseline/admin-ar/ar-school-more-1280.png` | Source; subjective motion | `apps/web/src/app/school.css` | Motion vocabulary requires review | Open — not verified |
| UI-19 | P2 | UIX-16 | admin-ar | `/ar/school/home` | 390 | `screenshots/baseline/admin-ar/ar-home-dark-390.png` | Source positive baseline | `apps/web/src/app/[locale]/layout.tsx; apps/web/src/app/school.css; apps/android/.../SchoolShell.kt` | Preserve safe areas, viewport and native shell | Preserve, regression unverified |

## Evidence contract

- Each `UI-XX` represents an **audit finding**, not necessarily a confirmed product defect. Source-only findings require browser/device reproduction, particularly UI-10–UI-14, UI-17–UI-19.
- All 416 screenshots are *historical diagnostic captures*, including skeleton and development-overlay images; never treat them as a passing terminal-state run.
- For every changed screen capture **before and after** with role, locale, CSS viewport, state, exact commit SHA and, if motion is material, an interaction recording.
- Do not compare with the archived HTML preview, modify live school data or silence genuine errors.
- Reconcile any ownership or route drift against the current repository before editing each task. This table is an inventory, not evidence that any fix has passed.
