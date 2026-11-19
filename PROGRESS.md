# Progress and session handoff

**Last planning baseline** 2026-11-19 · Design approved · implementation packet submitted for approval · implementation has not started.
**Current checkout** Local clone of ahmedmohameda7222-ship-it/Madrasty-el-arabia. Remote baseline 1fe75fc11a19d33188bd5bde514a43d49b99dec2 contained README.md. Identify the planning revision with `git log -1 --oneline` in the delivered checkout. A remote-only clone needs the planning files before it can begin.
**First action after implementation approval** F01, starting at its first unchecked step. **Next approval** Permission to implement this plan. Production activation is a later, separate decision.

| Milestone | Current state | Next boundary |
|---|---|---|
| 00 Foundation | Planned | Pin environment, build shells, publish contract primitives |
| 01 Identity and access | Planned | One account, effective grants and recoverable invites |
| 02 School operations | Planned | Import, linked families, dated staffing and clash-safe timetable |
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
| 2026-11-19 | F01, step 1 | Planned | Planning documents only | Waiting for plan approval | Inventory checkout and bind toolchains once approved |

## Decision and discrepancy log

| Date | Decision | Effect |
|---|---|---|
| 2026-11-19 | Owner defers writing and running all tests until after complete pre-launch deployment | Earlier TDD wording superseded. Build artifacts are marked pending final QA. |
| 2026-11-19 | One shared API, iPhone installed web, native Android APK from a school link | Web and Android both implement all applicable roles. Signing and controlled origin bind at release. |
| 2026-11-19 | No payment gateway, guardian reports planned absence, actual attendance requires explicit arrival override | Separate ledger entries, enrollment requests and student/day revisions; see product and contracts. |

## Session closing entry template

Record time, task/step reached, source revision or pending local files, evidence actually observed, open assumptions with owner, next ready card and exact resume action. Include pending manual/device checks, migration ledger and frozen candidate tuple when relevant. Store sanitized evidence only. A tester records command, exit result, counts and candidate; a release operator records approved destination and published artifact.
