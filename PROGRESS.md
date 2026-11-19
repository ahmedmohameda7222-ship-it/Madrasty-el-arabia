# Progress and session handoff

**Last planning baseline** 2026-11-19 · Design and implementation approved · synthetic pre-launch authorized.
**Current checkout** Local clone of ahmedmohameda7222-ship-it/Madrasty-el-arabia. Remote baseline 1fe75fc11a19d33188bd5bde514a43d49b99dec2 contained README.md. Identify the planning revision with `git log -1 --oneline` in the delivered checkout. A remote-only clone needs the planning files before it can begin.
**Current branch** implementation/prelaunch at planning baseline 1d84284. **Resume** S05 professional staff, subjects, class assignments and substitutes. S04 is in 922c28a and I04 is in 5b692d8. F01–F03/I01 are in 332942e; I02/I03/S01 are in 220a592; S02 is in 49f745c; S03 is in 648ce14. Live activation remains D06.

| Milestone | Current state | Next boundary |
|---|---|---|
| 00 Foundation | built / QA pending | Pin environment, build shells, publish contract primitives |
| 01 Identity and access | I01–I05 built / QA pending; I06 waits for S05 | One account, effective grants and recoverable invites |
| 02 School operations | Active (S05), S01–S04 built / QA pending | Import, linked families, dated staffing and clash-safe timetable |
| 03 Attendance | Planned | Online lock, actual arrival, offline reconciliation and approval |
| 04 Academics | Planned | Published lessons, gradebook, exam results and reports |
| 05 Communications | Planned | Scoped threads, localized notices, provider jobs, news and events |
| 06 Finance | Planned | Per-child invoice, manual settlement and stopping decisions |
| 07 Candidate and distribution | Planned | D05 records deployed web/API, database and signed APK |
| 08 Final QA | Waiting for candidate | Q01 starts all test authoring/execution; Q08 reconciles results |
| Live release | Awaiting verified build + owner authority | D06 |

## Task ledger

During execution, maintain one row per active or finished card. Card checkboxes belong to the owning plan; record evidence here to resume across sessions. Planned cards are enumerated centrally in PLANS and their linked modules. Allowed states: planned, active, blocked (specific dependency), built / QA pending, QA failed, verified. Record external delivery or live release separately.

| UTC date/time | Task and step | State | Files / revision / deployment | Evidence or blocker | Next authorized step |
|---|---|---|---|---|---|
| 2026-11-19 | F01 | built / QA pending — اتنفّذت وفي انتظار الاختبار | Workspace, lockfile, wrapper, docs/execution/environment.md | pnpm build:web, pnpm check:types and pnpm build:android exited 0. Debug APK at apps/android/app/build/outputs/apk/debug/app-debug.apk. Q01/Q06 pending. | F02 versioned contracts and scoped database foundation. |
| 2026-11-19 | F02 | built / QA pending — اتنفّذت وفي انتظار الاختبار | packages/contracts/openapi.yaml, database handlers, 20261119195638_app_foundation.sql | Type-check, Next production build and Kotlin assembly exited 0. Migration is local. Q01/Q03 pending for replay, transaction rollback and pooled isolation. | F03 platform shells. |
| 2026-11-19 | F03 | built / QA pending — اتنفّذت وفي انتظار الاختبار | Localized web and Compose shell primitives, approved notebook/seal assets, manifest and async states | Both builds exited 0. Q04/Q06 pending for loading, scope loss, device layout and accessibility. Feature data is wired by its owners. | I01 verified sign-in and session lifecycle. |
| 2026-11-19 | I01 | built / QA pending — اتنفّذت وفي انتظار الاختبار | Identity migration 20261119200552, auth routes, web cookies, native Keystore and PKCE | Type-check, web production build and Android debug build exited 0. D02 must bind the refresh-revocation hook; C05 binds push detach; D04 binds App Links. Q02/Q03/Q06 pending. | I02 recovery, MFA and succession. |
| 2026-11-19 | I02 | built / QA pending — اتنفّذت وفي انتظار الاختبار | 20261119201757_identity_lifecycle.sql, recovery/MFA/email routes, security screens, pre-launch bootstrap, staff deactivation | Type-check, production web build and debug Android assembly exited 0. D02 binds SMTP, templates and bootstrap. Q02/Q03/Q07 pending. | I03 access editor and capabilities. |
| 2026-11-19 | I03 | built / QA pending — اتنفّذت وفي انتظار الاختبار | 20261119202435_identity_permissions.sql, capability and inbox models, staff access/deactivation UI on web and Android | Type-check and both builds exited 0. Each feature must supply its object/date predicate. S05 binds staff assignment cleanup, C05 binds delivery cleanup, B01 binds single-use finance step-up. Q03/Q05 pending. | S01 school calendar. |
| 2026-11-19 | S01 | built / QA pending — اتنفّذت وفي انتظار الاختبار | 20261119203129_school_calendar.sql, school settings/year/day APIs and editors | Type-check, web production build and Android debug assembly exited 0. S03 binds class-calendar writes with real class IDs and A01 guards approved attendance against conflicting calendar edits. Q02/Q04 pending. | S02 pupils, family contacts and approved child links. |
| 2026-11-19 | S02 | built / QA pending — اتنفّذت وفي انتظار الاختبار | 20261119203840_families_links.sql; pupil/guardian CRUD, reviewable relationships, scoped child selection on web and Android | Type-check, web production build and Android debug assembly exited 0. S03 binds effective class labels, I04/S04 bind invitations/import and C07 consumes link events. Q02/Q03 pending. | S03 effective enrollment and rollovers. |
| 2026-11-19 | S03 | built / QA pending — اتنفّذت وفي انتظار الاختبار | 20261119204640_effective_enrollment.sql; scoped class CRUD, historical rosters, placement, transfers, rollover and class exceptions on web/Android | Type-check, production web and Android debug builds exited 0. A01/E03 still own protection of committed attendance/academic artifacts and roster insertion hooks when those tables exist; B05 owns fee-stop integration. Q02/Q03/Q04 pending. | S04 imports. |
| 2026-11-19 | S04 | built / QA pending — اتنفّذت وفي انتظار الاختبار | 20261119205739_family_imports.sql, CSV/XLSX templates, bounded parser and mapping/review/commit flows on both clients | Type-check, web production and Android debug builds exited 0. I04 links committed receipt to invite review; C06/D02 configure expiry cleanup; B02 consumes payer proposals. Q02/Q03/Q06 pending. | I04 invites. |
| 2026-11-19 | I04 | built / QA pending — اتنفّذت وفي انتظار الاختبار | 20261119210903_identity_invitations.sql, invite commands/worklists, web and Android activation, worker adapter | Type-check and both builds exited 0. C06 connects delivery, retries and bounces, D02 binds provider settings/secrets and D04 verifies App Links. Q02/Q03/Q06 pending. | I05 verified teacher applications. |
| 2026-11-19 | I05 | built / QA pending — اتنفّذت وفي انتظار الاختبار | 20261119211920_teacher_applications.sql, verified applicant session, review/decision and status on both clients | Type-check and web/Android builds exited 0. D02 binds verification SMTP and redirect templates; C07 delivers decision notices. Q02/Q03 pending. | S05 assignments, then I06 directory. |
| 2026-11-19 | S05, step 1 | Active | 20261119212628_staff_assignments.sql reserved | S01–S03 membership prerequisites available. | Build professional staff, dated teaching/attendance permissions, substitutes and editors. |

## Decision and discrepancy log

| Date | Decision | Effect |
|---|---|---|
| 2026-11-19 | Owner defers writing and running all tests until after complete pre-launch deployment | Earlier TDD wording superseded. Build artifacts are marked pending final QA. |
| 2026-11-19 | One shared API, iPhone installed web, native Android APK from a school link | Web and Android both implement all applicable roles. Signing and controlled origin bind at release. |
| 2026-11-19 | No payment gateway, guardian reports planned absence, actual attendance requires explicit arrival override | Separate ledger entries, enrollment requests and student/day revisions; see product and contracts. |

## Session closing entry template

Record time, task/step reached, source revision or pending local files, evidence actually observed, open assumptions with owner, next ready card and exact resume action. Include pending manual/device checks, migration ledger and frozen candidate tuple when relevant. Store sanitized evidence only. A tester records command, exit result, counts and candidate; a release operator records approved destination and published artifact.
