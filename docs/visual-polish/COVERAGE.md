# Scene evidence ledger — incomplete

Source registry fingerprint: `31ec3359be11f0263eaea7b310447baf263719c3cd2b069c6074406a0170b05c`. Source discovery includes 129 scenes. This document maps exact scene IDs to specifically observed runtime evidence; the registry itself remains discovery-only. A row is **PARTIAL** if a narrow test case ran or an attempted test reached the scene, not if its entire required matrix is audited. **OPEN** means no specific evidence is recorded here, not that the feature is missing. No scene is marked complete. For each scene, the full `requiredVariants`, query parameters, source predicates and element variants in SCENES/ELEMENTS and the master plan still apply. Hosted screenshots/traces are kept within disposable runners and have not been independently reviewed; neither screenshots nor test counts close a scene. Existing local evidence from earlier checkpoints stays in STATUS.md. Physical device and owner visual approval are open.

| Scene ID | Phase | Route / screen | State | Narrow evidence / remaining work |
| --- | --- | --- | --- | --- |
| WEB-.well-known/assetlinks.json-route | P11 | /.well-known/assetlinks.json | OPEN | No specifically verified state recorded in this ledger. |
| WR-001 | P03 | /[locale]/account/preferences | PARTIAL | Guardian DE 320 preference controls and unsaved theme selection; warmed P03 diagnostic passed (46082187416 Chromium). Save/error/locale/other roles still open. |
| WR-002 | P03 | /[locale]/account/profile | PARTIAL | Guardian DE 320 profile fields, warmed P03 diagnostic passed (46082187416 Chromium). Edit/save/error/long-name/device matrix open. |
| WR-003 | P03 | /[locale]/account/security/[action] | PARTIAL | AR/DE recover form and missing-token email/activation; warmed P03 diagnostic passed (46082187416 Chromium); valid/expired/replayed/submitting/success open. |
| WR-004 | P03 | /[locale]/account/security | OPEN | No specifically verified state recorded in this ledger. |
| WR-005 | P03 | /[locale]/account/sign-in | PARTIAL | Public DE 390 light and AR 320 dark sign-in fields, reveal/remask/autofill in warmed P03 diagnostic (46082187416 Chromium); other states open. |
| WR-006 | P08 | /[locale]/directory | OPEN | No specifically verified state recorded in this ledger. |
| WR-007 | P03 | /[locale]/install | PARTIAL | DE 390 and AR 320 iPhone/Android instructions in warm P03 diagnostic (46082187416 Chromium); cold DE failure open; APK ready/download and desktop open. |
| WR-008 | P03 | /[locale]/invite | PARTIAL | AR/DE missing-token invitation terminal state (warm 46082187416 Chromium); valid/expired/activation open. |
| WEB-[locale]-layout | P11 | /[locale] | OPEN | No specifically verified state recorded in this ledger. |
| WR-009 | P08 | /[locale]/open-notice/[id] | OPEN | No specifically verified state recorded in this ledger. |
| WR-010 | P03 | /[locale]/open/[kind]/[id] | OPEN | No specifically verified state recorded in this ledger. |
| WR-011 | P03 | /[locale] | PARTIAL | DE 390 light/AR 320 dark welcome, link destinations and branding (warm 46082187416 Chromium); cold install navigation and other states open. |
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
| WR-023 | P09 | /[locale]/school/more/calendar | OPEN | No specifically verified state recorded in this ledger. |
| WR-024 | P05 | /[locale]/school/more/classes | OPEN | No specifically verified state recorded in this ledger. |
| WR-025 | P07 | /[locale]/school/more/curriculum | OPEN | No specifically verified state recorded in this ledger. |
| WR-026 | P10 | /[locale]/school/more/enrollment-stops | OPEN | No specifically verified state recorded in this ledger. |
| WR-027 | P07 | /[locale]/school/more/evaluations | OPEN | No specifically verified state recorded in this ledger. |
| WR-028 | P09 | /[locale]/school/more/events | OPEN | No specifically verified state recorded in this ledger. |
| WR-029 | P07 | /[locale]/school/more/exams | OPEN | No specifically verified state recorded in this ledger. |
| WR-030 | P10 | /[locale]/school/more/fee-settings | OPEN | No specifically verified state recorded in this ledger. |
| WR-031 | P10 | /[locale]/school/more/finance-reports | OPEN | No specifically verified state recorded in this ledger. |
| WR-032 | P07 | /[locale]/school/more/grading | OPEN | No specifically verified state recorded in this ledger. |
| WR-033 | P07 | /[locale]/school/more/homework | OPEN | No specifically verified state recorded in this ledger. |
| WR-034 | P10 | /[locale]/school/more/invoices | OPEN | No specifically verified state recorded in this ledger. |
| WR-035 | P10 | /[locale]/school/more/issue-invoices | OPEN | No specifically verified state recorded in this ledger. |
| WR-036 | P08 | /[locale]/school/more/message-reports | OPEN | No specifically verified state recorded in this ledger. |
| WR-037 | P08 | /[locale]/school/more/news | OPEN | No specifically verified state recorded in this ledger. |
| WR-038 | P08 | /[locale]/school/more/notifications | OPEN | No specifically verified state recorded in this ledger. |
| WR-039 | P07 | /[locale]/school/more/oversight | PARTIAL | New synthetic published-vs-draft and class/pupil navigation test pending 46083680556; no audited coverage. |
| WR-040 | P10 | /[locale]/school/more/receipts | OPEN | No specifically verified state recorded in this ledger. |
| WR-041 | P10 | /[locale]/school/more/record-payment | OPEN | No specifically verified state recorded in this ledger. |
| WR-042 | P07 | /[locale]/school/more/reports | OPEN | No specifically verified state recorded in this ledger. |
| WR-043 | P10 | /[locale]/school/more/stop-reviews | OPEN | No specifically verified state recorded in this ledger. |
| WR-044 | P09 | /[locale]/school/more/timetable | OPEN | No specifically verified state recorded in this ledger. |
| WR-045 | P05 | /[locale]/school/students/import | OPEN | No specifically verified state recorded in this ledger. |
| WR-046 | P03 | /[locale]/staff/access | PARTIAL | Guardian DE 320 denied 404 in warm P03 diagnostic (46082187416 Chromium); authorized controls/roles/save/error open. |
| WR-047 | P05 | /[locale]/staff/invitations | OPEN | No specifically verified state recorded in this ledger. |
| WEB-auth/android/callback-route | P03 | /auth/android/callback | OPEN | No specifically verified state recorded in this ledger. |
| WEB-download/android-route | P03 | /download/android | OPEN | No specifically verified state recorded in this ledger. |
| WEB-install-route | P03 | /install | OPEN | No specifically verified state recorded in this ledger. |
| TAB-1 | P04 | /[locale]/school/home | PARTIAL | Admin DE 390, guardian AR 320, teacher DE 390 light/AR 320 dark, teacher-other DE 320 dark/substitute AR 390 light. Real API assignment/lesson comparison and navigation in 46081553330 both browsers; full role/theme/device/fixture and native coverage open. |
| TAB-2 | P05 | /[locale]/school/students | OPEN | No specifically verified state recorded in this ledger. |
| TAB-3 | P06 | /[locale]/school/attendance | PARTIAL | Teacher DE 390/AR 320 configured open sheet, exact counts and rows reached (46082187416 Chromium); RED 200% reflow/geometry. Candidate pending 46083680556. |
| TAB-4 | P05 | /[locale]/school/children | OPEN | No specifically verified state recorded in this ledger. |
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
| AN-001 | Native / see plan | Tabs | OPEN | No specifically verified state recorded in this ledger. |
| AN-002 | Native / see plan | Account | OPEN | No specifically verified state recorded in this ledger. |
| AN-003 | Native / see plan | Profile | OPEN | No specifically verified state recorded in this ledger. |
| AN-004 | Native / see plan | Security | OPEN | No specifically verified state recorded in this ledger. |
| AN-005 | Native / see plan | Directory | OPEN | No specifically verified state recorded in this ledger. |
| AN-006 | Native / see plan | Thread | OPEN | No specifically verified state recorded in this ledger. |
| AN-007 | Native / see plan | MessageReports | OPEN | No specifically verified state recorded in this ledger. |
| AN-008 | Native / see plan | Bank | OPEN | No specifically verified state recorded in this ledger. |
| AN-009 | Native / see plan | FeeSettings | OPEN | No specifically verified state recorded in this ledger. |
| AN-010 | Native / see plan | IssueInvoices | OPEN | No specifically verified state recorded in this ledger. |
| AN-011 | Native / see plan | Invoices | OPEN | No specifically verified state recorded in this ledger. |
| AN-012 | Native / see plan | Payment | OPEN | No specifically verified state recorded in this ledger. |
| AN-013 | Native / see plan | Receipts | OPEN | No specifically verified state recorded in this ledger. |
| AN-014 | Native / see plan | FinanceReport | OPEN | No specifically verified state recorded in this ledger. |
| AN-015 | Native / see plan | Stops | OPEN | No specifically verified state recorded in this ledger. |
| AN-016 | Native / see plan | StopReviews | OPEN | No specifically verified state recorded in this ledger. |
| AN-017 | Native / see plan | Broadcasts | OPEN | No specifically verified state recorded in this ledger. |
| AN-018 | Native / see plan | Notifications | OPEN | No specifically verified state recorded in this ledger. |
| AN-019 | Native / see plan | ResourceUnavailable | OPEN | No specifically verified state recorded in this ledger. |
| AN-020 | Native / see plan | Publication | OPEN | No specifically verified state recorded in this ledger. |
| AN-021 | Native / see plan | Access | OPEN | No specifically verified state recorded in this ledger. |
| AN-022 | Native / see plan | Calendar | OPEN | No specifically verified state recorded in this ledger. |
| AN-023 | Native / see plan | Enrollment | OPEN | No specifically verified state recorded in this ledger. |
| AN-024 | Native / see plan | AttendanceReview | OPEN | No specifically verified state recorded in this ledger. |
| AN-025 | Native / see plan | AttendanceHistory | OPEN | No specifically verified state recorded in this ledger. |
| AN-026 | Native / see plan | OfflineAttendance | OPEN | No specifically verified state recorded in this ledger. |
| AN-027 | Native / see plan | Excuse | OPEN | No specifically verified state recorded in this ledger. |
| AN-028 | Native / see plan | Curriculum | OPEN | No specifically verified state recorded in this ledger. |
| AN-029 | Native / see plan | Homework | OPEN | No specifically verified state recorded in this ledger. |
| AN-030 | Native / see plan | Gradebook | OPEN | No specifically verified state recorded in this ledger. |
| AN-031 | Native / see plan | AcademicWork | OPEN | No specifically verified state recorded in this ledger. |
| AN-032 | Native / see plan | Report | OPEN | No specifically verified state recorded in this ledger. |
| AN-033 | Native / see plan | Evaluations | OPEN | No specifically verified state recorded in this ledger. |
| AN-034 | Native / see plan | Exams | OPEN | No specifically verified state recorded in this ledger. |
| AN-035 | Native / see plan | Timetable | OPEN | No specifically verified state recorded in this ledger. |
| AN-036 | Native / see plan | Invitations | OPEN | No specifically verified state recorded in this ledger. |
| AN-037 | Native / see plan | Import | OPEN | No specifically verified state recorded in this ledger. |
| AN-038 | Native / see plan | Assignments | OPEN | No specifically verified state recorded in this ledger. |
| AN-039 | Native / see plan | Family | OPEN | No specifically verified state recorded in this ledger. |
| AN-040 | Native / see plan | AdminTasks | OPEN | No specifically verified state recorded in this ledger. |
| AN-041 | Native / see plan | Queue | OPEN | No specifically verified state recorded in this ledger. |
| AN-root | Native / see plan | App entry and platform intents | OPEN | No specifically verified state recorded in this ledger. |
| AN-sign-in | Native / see plan | Sign-in, MFA and errors | PARTIAL | API35 emulator 320dp and 393dp: signed-out primary control visibility/disabled/height verified in 46081000121. MFA, failure/loading, locale/fontScale/device variants open. |
| AN-invitation | Native / see plan | Invitation and activation | OPEN | No specifically verified state recorded in this ledger. |
| AN-release-gate | Native / see plan | Unsupported or outdated app | OPEN | No specifically verified state recorded in this ledger. |

## Evidence bookkeeping

- 46081553330 (P04 candidate): both browser hierarchy assertions passed; full suites failed elsewhere. 46082187416 (P05 candidate): Chromium 43/46, warm P03 diagnostic 5/5, WebKit infrastructure failure. 46081000121 native suite passed 22 instrumentation cases per emulator size, not 22 audited scenes.
- 46083680556 and 46083875529 are development-only test runs; results must be reconciled before making additional completion claims.
- The full source element registry remains `DISCOVERED_PENDING_MANUAL_AND_RUNTIME_REVIEW`. Record per-element state, keyboard/accessibility checks, observed viewport/locale/role and before/after evidence during actual review, not by mechanically marking JSX or Compose candidates as covered.
