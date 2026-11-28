# Scene evidence ledger — incomplete

Source registry fingerprint: `a7771eebe5f9c6e1b971752352bae6686426da1bab8ca6af2afaa267b90afd1a`. Source discovery includes 129 scenes. This document maps exact scene IDs to specifically observed runtime evidence; the registry itself remains discovery-only. A row is **PARTIAL** if a narrow test case ran or an attempted test reached the scene, not if its entire required matrix is audited. **OPEN** means no specific evidence is recorded here, not that the feature is missing. No scene is marked complete. For each scene, the full `requiredVariants`, query parameters, source predicates and element variants in SCENES/ELEMENTS and the master plan still apply. Hosted screenshots/traces are kept within disposable runners and have not been independently reviewed; neither screenshots nor test counts close a scene. Existing local evidence from earlier checkpoints stays in STATUS.md. Physical device and owner visual approval are open.

| Scene ID | Phase | Route / screen | State | Narrow evidence / remaining work |
| --- | --- | --- | --- | --- |
| WEB-.well-known/assetlinks.json-route | P11 | /.well-known/assetlinks.json | OPEN | No specifically verified state recorded in this ledger. |
| WR-001 | P03 | /[locale]/account/preferences | PARTIAL | Guardian DE 320 preference controls and unsaved theme selection; warmed P03 diagnostic passed (46082187416 Chromium). Save/error/locale/other roles still open. |
| WR-002 | P03 | /[locale]/account/profile | PARTIAL | Guardian DE 320 profile fields, warmed P03 diagnostic passed (46082187416 Chromium). Edit/save/error/long-name/device matrix open. |
| WR-003 | P03 | /[locale]/account/security/[action] | PARTIAL | AR/DE recover form and missing-token email/activation; warmed P03 diagnostic passed (46082187416 Chromium); valid/expired/replayed/submitting/success open. |
| WR-004 | P03 | /[locale]/account/security | OPEN | No specifically verified state recorded in this ledger. |
| WR-005 | P03 | /[locale]/account/sign-in | PARTIAL | Signed-out entry and identity tests 4/4 each browser on production build 46085892025; invalid credentials, MFA and authenticated production fixture remain open. |
| WR-006 | P08 | /[locale]/directory | PARTIAL | Guardian contact picker and full searchable directory original regression passed (46083875529 WebKit); all roles, terminal states and visual matrix open. |
| WR-007 | P03 | /[locale]/install | PARTIAL | Original signed-out entry passed 4/4 suite on production Chromium and WebKit 46085892025; intermittent dev first click and ready APK variants still open. |
| WR-008 | P03 | /[locale]/invite | PARTIAL | Missing-token terminal state passed production signed-out suite both browsers 46085892025; valid/expired/activation open. |
| WEB-[locale]-layout | P11 | /[locale] | OPEN | No specifically verified state recorded in this ledger. |
| WR-009 | P08 | /[locale]/open-notice/[id] | OPEN | No specifically verified state recorded in this ledger. |
| WR-010 | P03 | /[locale]/open/[kind]/[id] | OPEN | No specifically verified state recorded in this ledger. |
| WR-011 | P03 | /[locale] | PARTIAL | Original public entry journey passed production both browsers 46085892025; no dev flake waiver, repeated cold and device variants open. |
| WR-012 | P04 | /[locale]/school/[tab] | OPEN | No specifically verified state recorded in this ledger. |
| WR-013 | P06 | /[locale]/school/children/[childId]/attendance | OPEN | No specifically verified state recorded in this ledger. |
| WR-014 | P06 | /[locale]/school/children/[childId]/excuse | OPEN | No specifically verified state recorded in this ledger. |
| WR-015 | P04 | /[locale]/school/home/queues/[key] | OPEN | No specifically verified state recorded in this ledger. |
| WR-016 | P04 | /[locale]/school/home/tasks | PARTIAL | Admin DE 390 task overview link and AR 320 date-preserving back navigation (46081553330, both browsers); unavailable and full state/capability matrix open. |
| WEB-[locale]/school-layout | P11 | /[locale]/school | OPEN | No specifically verified state recorded in this ledger. |
| WEB-[locale]/school-loading | P11 | /[locale]/school | OPEN | No specifically verified state recorded in this ledger. |
| WR-017 | P07 | /[locale]/school/more/academics | OPEN | No specifically verified state recorded in this ledger. |
| WR-018 | P05 | /[locale]/school/more/assignments | PARTIAL | Admin DE 390 light and AR 320 dark staff directory and direct-provision open/cancel, geometry/token colors (46082187416 Chromium); WebKit candidate and assignment/permission variants open. |
| WR-019 | P06 | /[locale]/school/more/attendance/history | OPEN | No specifically verified state recorded in this ledger. |
| WR-020 | P06 | /[locale]/school/more/attendance | OPEN | No specifically verified state recorded in this ledger. |
| WR-021 | P10 | /[locale]/school/more/bank | OPEN | No specifically verified state recorded in this ledger. |
| WR-022 | P08 | /[locale]/school/more/broadcasts | OPEN | No specifically verified state recorded in this ledger. |
| WR-023 | P09 | /[locale]/school/more/calendar | PARTIAL | Original calendar UI regression 4/4 Chromium 46083875529; P09 baseline RED geometry both browsers 46084728002; scoped candidate 02c5dfa pending browser verification. |
| WR-024 | P05 | /[locale]/school/more/classes | OPEN | No specifically verified state recorded in this ledger. |
| WR-025 | P07 | /[locale]/school/more/curriculum | OPEN | No specifically verified state recorded in this ledger. |
| WR-026 | P10 | /[locale]/school/more/enrollment-stops | OPEN | No specifically verified state recorded in this ledger. |
| WR-027 | P07 | /[locale]/school/more/evaluations | OPEN | No specifically verified state recorded in this ledger. |
| WR-028 | P09 | /[locale]/school/more/events | OPEN | No specifically verified state recorded in this ledger. |
| WR-029 | P07 | /[locale]/school/more/exams | OPEN | No specifically verified state recorded in this ledger. |
| WR-030 | P10 | /[locale]/school/more/fee-settings | OPEN | No specifically verified state recorded in this ledger. |
| WR-031 | P10 | /[locale]/school/more/finance-reports | PARTIAL | Admin/guardian iPhone WebKit finance visual regression 5/5 46083875529; fresh finance domain test green 46085891983. New balance hierarchy tests pending. |
| WR-032 | P07 | /[locale]/school/more/grading | OPEN | No specifically verified state recorded in this ledger. |
| WR-033 | P07 | /[locale]/school/more/homework | OPEN | No specifically verified state recorded in this ledger. |
| WR-034 | P10 | /[locale]/school/more/invoices | PARTIAL | Actual paid/partial/unpaid invoices, protected PDF links and payer scope passed iPhone WebKit 46083875529; new geometry tests pending, full review open. |
| WR-035 | P10 | /[locale]/school/more/issue-invoices | OPEN | No specifically verified state recorded in this ledger. |
| WR-036 | P08 | /[locale]/school/more/message-reports | OPEN | No specifically verified state recorded in this ledger. |
| WR-037 | P08 | /[locale]/school/more/news | OPEN | No specifically verified state recorded in this ledger. |
| WR-038 | P08 | /[locale]/school/more/notifications | OPEN | No specifically verified state recorded in this ledger. |
| WR-039 | P07 | /[locale]/school/more/oversight | PARTIAL | New P07 read-only class/pupil/announced-only exam, 22px card, 24px/740 KPI and 200% reflow green both browsers 46084728002. Full academic visual and device matrix open. |
| WR-040 | P10 | /[locale]/school/more/receipts | PARTIAL | Actual receipts and protected PDFs passed iPhone WebKit 46083875529; fresh finance domain green 46085891983. Full state matrix open. |
| WR-041 | P10 | /[locale]/school/more/record-payment | OPEN | No specifically verified state recorded in this ledger. |
| WR-042 | P07 | /[locale]/school/more/reports | OPEN | No specifically verified state recorded in this ledger. |
| WR-043 | P10 | /[locale]/school/more/stop-reviews | OPEN | No specifically verified state recorded in this ledger. |
| WR-044 | P09 | /[locale]/school/more/timetable | OPEN | No specifically verified state recorded in this ledger. |
| WR-045 | P05 | /[locale]/school/students/import | PARTIAL | Family import tested in 22-case family suite (46083875529 Chromium); all import error and permission variants/visual review open. |
| WR-046 | P03 | /[locale]/staff/access | PARTIAL | Guardian DE 320 denied 404 in warm P03 diagnostic (46082187416 Chromium); authorized controls/roles/save/error open. |
| WR-047 | P05 | /[locale]/staff/invitations | OPEN | No specifically verified state recorded in this ledger. |
| WEB-auth/android/callback-route | P03 | /auth/android/callback | OPEN | No specifically verified state recorded in this ledger. |
| WEB-download/android-route | P03 | /download/android | OPEN | No specifically verified state recorded in this ledger. |
| WEB-install-route | P03 | /install | OPEN | No specifically verified state recorded in this ledger. |
| TAB-1 | P04 | /[locale]/school/home | PARTIAL | Admin DE 390, guardian AR 320, teacher DE 390 light/AR 320 dark, teacher-other DE 320 dark/substitute AR 390 light. Real API assignment/lesson comparison and navigation in 46081553330 both browsers; full role/theme/device/fixture and native coverage open. |
| TAB-2 | P05 | /[locale]/school/students | PARTIAL | Family wizard/import and guardian-related UI regression suite 22/22 (46083875529 Chromium); entire element/state matrix and matched visual review open. |
| TAB-3 | P06 | /[locale]/school/attendance | PARTIAL | Configured attendance tally and selectors at DE 390/AR 320 including 200% reflow both browsers (46083680556); original ready/offline-conflict UI passed (46083875529 Chromium). Full variants open. |
| TAB-4 | P05 | /[locale]/school/children | PARTIAL | Guardian children and family workflows tested in 22-case family suite (46083875529 Chromium); full state matrix open. |
| TAB-5 | P08 | /[locale]/school/messages | OPEN | No specifically verified state recorded in this ledger. |
| TAB-6 | P09 | /[locale]/school/calendar | OPEN | No specifically verified state recorded in this ledger. |
| TAB-7 | P04 | /[locale]/school/more | PARTIAL | Admin/admin-two/office/finance/supervisor/teacher/substitute/guardian-ar/guardian-de in DE 390 light and AR 320 dark; keyboard disclosures, visible rows, focus, reflow, checked route subsets (46081553330 both browsers); full expected capability inventory, destination clicks, dual-role and guardian-other open. |
| WEB-school-home-queues-guardian_links | P04 | /[locale]/school/home/queues/guardian_links | PARTIAL | Admin DE 390 and AR 320 dark actual API rows/date/back links (46081553330 both browsers). Pagination only if returned cursor; not independently confirmed. Missing explicit zero/many/unavailable/role restrictions and matched visual review. |
| WEB-school-home-queues-family_imports | P04 | /[locale]/school/home/queues/family_imports | PARTIAL | Admin DE 390 and AR 320 dark actual API rows/date/back links (46081553330 both browsers). Pagination only if returned cursor; not independently confirmed. Missing explicit zero/many/unavailable/role restrictions and matched visual review. |
| WEB-school-home-queues-class_assignments | P04 | /[locale]/school/home/queues/class_assignments | PARTIAL | Admin DE 390 and AR 320 dark actual API rows/date/back links (46081553330 both browsers). Pagination only if returned cursor; not independently confirmed. Missing explicit zero/many/unavailable/role restrictions and matched visual review. |
| WEB-school-home-queues-bounced_invites | P04 | /[locale]/school/home/queues/bounced_invites | PARTIAL | Admin DE 390 and AR 320 dark actual API rows/date/back links (46081553330 both browsers). Pagination only if returned cursor; not independently confirmed. Missing explicit zero/many/unavailable/role restrictions and matched visual review. |
| WEB-school-home-queues-unapproved_attendance | P04 | /[locale]/school/home/queues/unapproved_attendance | PARTIAL | Admin DE 390 and AR 320 dark actual API rows/date/back links (46081553330 both browsers). Pagination only if returned cursor; not independently confirmed. Missing explicit zero/many/unavailable/role restrictions and matched visual review. |
| WEB-school-home-queues-noncontinuation_requests | P04 | /[locale]/school/home/queues/noncontinuation_requests | PARTIAL | Admin DE 390 and AR 320 dark actual API rows/date/back links (46081553330 both browsers). Pagination only if returned cursor; not independently confirmed. Missing explicit zero/many/unavailable/role restrictions and matched visual review. |
| WEB-school-home-queues-settlement_review | P04 | /[locale]/school/home/queues/settlement_review | PARTIAL | Admin DE 390 and AR 320 dark actual API rows/date/back links (46081553330 both browsers). Pagination only if returned cursor; not independently confirmed. Missing explicit zero/many/unavailable/role restrictions and matched visual review. |
| WEB-account-security-recover | P03 | /[locale]/account/security/recover | PARTIAL | AR/DE recovery email input and enabled submit (warm 46082187416 Chromium); submission outcome and token variants open. |
| WEB-account-security-email | P03 | /[locale]/account/security/email | PARTIAL | AR/DE no-token alert, no form (warm 46082187416 Chromium); all other variants open. |
| WEB-account-security-activate | P03 | /[locale]/account/security/activate | PARTIAL | AR/DE no-token alert, no form (warm 46082187416 Chromium); all other variants open. |
| WEB-open-notice | P03 | /[locale]/open/notice/[id] | OPEN | No specifically verified state recorded in this ledger. |
| WEB-open-thread | P03 | /[locale]/open/thread/[id] | OPEN | No specifically verified state recorded in this ledger. |
| WEB-open-broadcast | P03 | /[locale]/open/broadcast/[id] | OPEN | No specifically verified state recorded in this ledger. |
| WEB-open-child | P03 | /[locale]/open/child/[id] | OPEN | No specifically verified state recorded in this ledger. |
| WEB-open-attendance | P03 | /[locale]/open/attendance/[id] | OPEN | No specifically verified state recorded in this ledger. |
| WEB-open-exam | P03 | /[locale]/open/exam/[id] | OPEN | No specifically verified state recorded in this ledger. |
| WEB-open-evaluation | P03 | /[locale]/open/evaluation/[id] | OPEN | No specifically verified state recorded in this ledger. |
| WEB-open-activity | P03 | /[locale]/open/activity/[id] | OPEN | No specifically verified state recorded in this ledger. |
| WEB-open-homework | P03 | /[locale]/open/homework/[id] | OPEN | No specifically verified state recorded in this ledger. |
| WEB-open-invoice | P03 | /[locale]/open/invoice/[id] | OPEN | No specifically verified state recorded in this ledger. |
| WEB-open-receipt | P03 | /[locale]/open/receipt/[id] | OPEN | No specifically verified state recorded in this ledger. |
| WEB-open-fee_stop | P03 | /[locale]/open/fee_stop/[id] | OPEN | No specifically verified state recorded in this ledger. |
| WEB-offline-attendance | P06 | /offline/attendance.html | OPEN | No specifically verified state recorded in this ledger. |
| AN-001 | P04/P05/P06/P08/P09 | Tabs | PARTIAL | Hosted API35 320dp/393dp FoundationVisualTest and CommunicationVisualTest component harnesses passed 46081000121. Actual signed-in SchoolTabs destinations, real API content and full fontScale/theme/capability matrix remain open. |
| AN-002 | P03 | Account | OPEN | No specifically verified state recorded in this ledger. |
| AN-003 | P03 | Profile | OPEN | No specifically verified state recorded in this ledger. |
| AN-004 | P03 | Security | OPEN | No specifically verified state recorded in this ledger. |
| AN-005 | P08 | Directory | OPEN | No specifically verified state recorded in this ledger. |
| AN-006 | P08 | Thread | PARTIAL | Native communication component tests on synthetic messages/drafts passed 46081000121; not a full live native thread/API audit. |
| AN-007 | P08 | MessageReports | OPEN | No specifically verified state recorded in this ledger. |
| AN-008 | P10 | Bank | OPEN | No specifically verified state recorded in this ledger. |
| AN-009 | P10 | FeeSettings | OPEN | No specifically verified state recorded in this ledger. |
| AN-010 | P10 | IssueInvoices | OPEN | No specifically verified state recorded in this ledger. |
| AN-011 | P10 | Invoices | PARTIAL | Native FinanceVisualTest component cases passed 46081000121; actual invoice lists/detail/API states and permissions still open. |
| AN-012 | P10 | Payment | OPEN | No specifically verified state recorded in this ledger. |
| AN-013 | P10 | Receipts | OPEN | No specifically verified state recorded in this ledger. |
| AN-014 | P10 | FinanceReport | PARTIAL | Native FinanceVisualTest component cases passed 46081000121; full live report/API and payer scope audit open. |
| AN-015 | P10 | Stops | OPEN | No specifically verified state recorded in this ledger. |
| AN-016 | P10 | StopReviews | OPEN | No specifically verified state recorded in this ledger. |
| AN-017 | P08 | Broadcasts | OPEN | No specifically verified state recorded in this ledger. |
| AN-018 | P08 | Notifications | OPEN | No specifically verified state recorded in this ledger. |
| AN-019 | P03/P11 | ResourceUnavailable | OPEN | No specifically verified state recorded in this ledger. |
| AN-020 | P08/P09 | Publication | OPEN | No specifically verified state recorded in this ledger. |
| AN-021 | P03 | Access | OPEN | No specifically verified state recorded in this ledger. |
| AN-022 | P09 | Calendar | OPEN | No specifically verified state recorded in this ledger. |
| AN-023 | P05 | Enrollment | OPEN | No specifically verified state recorded in this ledger. |
| AN-024 | P06 | AttendanceReview | OPEN | No specifically verified state recorded in this ledger. |
| AN-025 | P06 | AttendanceHistory | OPEN | No specifically verified state recorded in this ledger. |
| AN-026 | P06 | OfflineAttendance | OPEN | No specifically verified state recorded in this ledger. |
| AN-027 | P06 | Excuse | OPEN | No specifically verified state recorded in this ledger. |
| AN-028 | P07 | Curriculum | OPEN | No specifically verified state recorded in this ledger. |
| AN-029 | P07 | Homework | OPEN | No specifically verified state recorded in this ledger. |
| AN-030 | P07 | Gradebook | OPEN | No specifically verified state recorded in this ledger. |
| AN-031 | P07 | AcademicWork | OPEN | No specifically verified state recorded in this ledger. |
| AN-032 | P07 | Report | OPEN | No specifically verified state recorded in this ledger. |
| AN-033 | P07 | Evaluations | OPEN | No specifically verified state recorded in this ledger. |
| AN-034 | P07 | Exams | OPEN | No specifically verified state recorded in this ledger. |
| AN-035 | P09 | Timetable | OPEN | No specifically verified state recorded in this ledger. |
| AN-036 | P05 | Invitations | OPEN | No specifically verified state recorded in this ledger. |
| AN-037 | P05 | Import | OPEN | No specifically verified state recorded in this ledger. |
| AN-038 | P05 | Assignments | OPEN | No specifically verified state recorded in this ledger. |
| AN-039 | P05 | Family | PARTIAL | Native FamilyVisualTest five-step component wizard cases passed 46081000121; real native family flow, import and data states open. |
| AN-040 | P04 | AdminTasks | OPEN | No specifically verified state recorded in this ledger. |
| AN-041 | P04 | Queue | OPEN | No specifically verified state recorded in this ledger. |
| AN-root | P03/P11 | App entry and platform intents | OPEN | No specifically verified state recorded in this ledger. |
| AN-sign-in | P03 | Sign-in, MFA and errors | PARTIAL | API35 emulator 320dp and 393dp: signed-out primary control visibility/disabled/height verified in 46081000121. MFA, failure/loading, locale/fontScale/device variants open. |
| AN-invitation | P03 | Invitation and activation | OPEN | No specifically verified state recorded in this ledger. |
| AN-release-gate | P03 | Unsupported or outdated app | OPEN | No specifically verified state recorded in this ledger. |

## Evidence bookkeeping

- 46081553330 (P04 candidate): both browser hierarchy assertions passed; full suites failed elsewhere. 46082187416 (P05 candidate): Chromium 43/46, warm P03 diagnostic 5/5, WebKit infrastructure failure. 46081000121 native suite passed 22 instrumentation cases per emulator size, not 22 audited scenes.
- 46083680556 and 46083875529 are development-only test runs; results must be reconciled before making additional completion claims.
- The full source element registry remains `DISCOVERED_PENDING_MANUAL_AND_RUNTIME_REVIEW`. Record per-element state, keyboard/accessibility checks, observed viewport/locale/role and before/after evidence during actual review, not by mechanically marking JSX or Compose candidates as covered.

## Native tab expansion (manual discovery, not execution)

AN-001 is a container route, not one screen. Reviewed SchoolWorkspace.kt's SchoolTabs and SchoolSettings dispatch: expand into Admin/Teacher/Guardian Home (P04), Students (P05 capability-gated), Children (P05 with attendance/academic/finance destinations), Attendance (P06), Messages chat/feed (P08), independent Calendar (P09), and More with account/school/finance/access groups (P04). Each requires actual runtime role/state checks; the component harness is not enough. For each native workspace route above, retain every declaration parameter from SCENES.json and all source predicates; verify authorized/denied/empty/ready/editing/error/offline variants when applicable. Manual review remains open.
