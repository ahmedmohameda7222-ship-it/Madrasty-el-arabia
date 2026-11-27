# Complete presentation source and route inventory (baseline)
Baseline commit: `b90fab0bec705b4bf25eb8e43f4f6f8eaa6de77a`. Generated from the non-truncated Git tree. Counts refer to files and declared route/page patterns, NOT audited screens or passed tests. A route may render many states. Every record starts OPEN. This inventory is the initial coverage denominator; P00 must expand it using actual route dispatch, query branches, capability predicates, conditional JSX/composables and rendered elements. No claiming completion from filenames.

## Web route files (47)
All paths prefixed by `/[locale]` with ar/de. Role hints are not permission changes: inspect the actual predicate. For each row apply the universal checklist, capture both authorized populated and applicable negative/empty states, and retain every query, action, field and destination. Exact source paths below.

| ID | Phase | Route | Role/context | Required visual variants | Source | Status |
| --- | --- | --- | --- | --- | --- | --- |
| WR-001 | P03 | `/account/preferences` | All | Appearance light/dark/system, language, notifications, local preferences, save and error. | `apps/web/src/app/[locale]/account/preferences/page.tsx` | OPEN |
| WR-002 | P03 | `/account/profile` | All | Profile names/fields, editable/read-only, long names, save/error. | `apps/web/src/app/[locale]/account/profile/page.tsx` | OPEN |
| WR-003 | P03 | `/account/security/[action]` | Public | recover / email / activate; valid, missing, expired, used token, submitting, success, error; never render token. | `apps/web/src/app/[locale]/account/security/[action]/page.tsx` | OPEN |
| WR-004 | P03 | `/account/security` | All | MFA, recovery, email changes, security status, confirmations, restricted session. | `apps/web/src/app/[locale]/account/security/page.tsx` | OPEN |
| WR-005 | P03 | `/account/sign-in` | Public | Email/password, password reveal, MFA, invalid credentials, locked/loading, recovery. | `apps/web/src/app/[locale]/account/sign-in/page.tsx` | OPEN |
| WR-006 | P08 | `/directory` | All allowed | Directory and compose modes, search, person rows, action menus, start conversation. | `apps/web/src/app/[locale]/directory/page.tsx` | OPEN |
| WR-007 | P03 | `/install` | Public | iOS PWA instructions, Android download, unavailable/unsupported, desktop. | `apps/web/src/app/[locale]/install/page.tsx` | OPEN |
| WR-008 | P03 | `/invite` | Public | Invitation, invalid/expired, identity verification, activation and completion. | `apps/web/src/app/[locale]/invite/page.tsx` | OPEN |
| WR-009 | P08 | `/open-notice/[id]` | All allowed | Notification redirect, unauthenticated, inaccessible, invalid; no data leak. | `apps/web/src/app/[locale]/open-notice/[id]/page.tsx` | OPEN |
| WR-010 | P03 | `/open/[kind]/[id]` | All allowed | Every contract resource kind; signed-out return, invalid, unavailable/denied; destination unchanged. | `apps/web/src/app/[locale]/open/[kind]/[id]/page.tsx` | OPEN |
| WR-011 | P03 | `/` | Public | Landing, branding, language selection, existing session, initial loading; no added marketing. | `apps/web/src/app/[locale]/page.tsx` | OPEN |
| WR-012 | P04 | `/school/[tab]` | Role dependent | Expand every tab below; every supported query parameter and permission variant. | `apps/web/src/app/[locale]/school/[tab]/page.tsx` | OPEN |
| WR-013 | P06 | `/school/children/[childId]/attendance` | Guardian | Child attendance history and details, long names, loading/empty/denied. | `apps/web/src/app/[locale]/school/children/[childId]/attendance/page.tsx` | OPEN |
| WR-014 | P06 | `/school/children/[childId]/excuse` | Guardian | Existing excuse forms, date, validation, status, retry. | `apps/web/src/app/[locale]/school/children/[childId]/excuse/page.tsx` | OPEN |
| WR-015 | P04 | `/school/home/queues/[key]` | Admin | Every queue key below; date filter, count, rows, pagination, unavailable, target link. | `apps/web/src/app/[locale]/school/home/queues/[key]/page.tsx` | OPEN |
| WR-016 | P04 | `/school/home/tasks` | Admin | Task overview, groups, zero/nonzero counts, links and states. | `apps/web/src/app/[locale]/school/home/tasks/page.tsx` | OPEN |
| WR-017 | P07 | `/school/more/academics` | Allowed | Teaching/activity list, detail, edit/create, published/draft as currently permitted. | `apps/web/src/app/[locale]/school/more/academics/page.tsx` | OPEN |
| WR-018 | P05 | `/school/more/assignments` | Allowed | Staff workspace, assignment list, detail, class teacher controls, existing role/access. | `apps/web/src/app/[locale]/school/more/assignments/page.tsx` | OPEN |
| WR-019 | P06 | `/school/more/attendance/history` | Allowed | Date/class/child filter, history, rows, details, approval state. | `apps/web/src/app/[locale]/school/more/attendance/history/page.tsx` | OPEN |
| WR-020 | P06 | `/school/more/attendance` | Allowed | Supervisor review, class/date, draft/submitted/approved and existing actions. | `apps/web/src/app/[locale]/school/more/attendance/page.tsx` | OPEN |
| WR-021 | P10 | `/school/more/bank` | Allowed | Bank data, masked details, edits, MFA, save/errors; no new financial behavior. | `apps/web/src/app/[locale]/school/more/bank/page.tsx` | OPEN |
| WR-022 | P08 | `/school/more/broadcasts` | Allowed | Broadcast list, detail, composer, recipient picker, status and failure. | `apps/web/src/app/[locale]/school/more/broadcasts/page.tsx` | OPEN |
| WR-023 | P09 | `/school/more/calendar` | Allowed | School year, term, holiday, teaching day, create/edit and date inputs. | `apps/web/src/app/[locale]/school/more/calendar/page.tsx` | OPEN |
| WR-024 | P05 | `/school/more/classes` | Allowed | Classes, enrollments, existing class settings, membership, transfers and status. | `apps/web/src/app/[locale]/school/more/classes/page.tsx` | OPEN |
| WR-025 | P07 | `/school/more/curriculum` | Allowed | Subject/lesson, scope, edit, publish, details, existing parent read-only view. | `apps/web/src/app/[locale]/school/more/curriculum/page.tsx` | OPEN |
| WR-026 | P10 | `/school/more/enrollment-stops` | Admin/guardian allowed | Next-month pause request, queue, detail, resolved, revoke if existing; preserve no-approval policy. | `apps/web/src/app/[locale]/school/more/enrollment-stops/page.tsx` | OPEN |
| WR-027 | P07 | `/school/more/evaluations` | Allowed | Evaluation list, score/rubric, student selector, editing, results and published states. | `apps/web/src/app/[locale]/school/more/evaluations/page.tsx` | OPEN |
| WR-028 | P09 | `/school/more/events` | Allowed | Event list/detail, add/edit, agenda, status, existing permissions. | `apps/web/src/app/[locale]/school/more/events/page.tsx` | OPEN |
| WR-029 | P07 | `/school/more/exams` | Allowed | Exam list/detail, grading and marks, published/draft visibility, numeric fields. | `apps/web/src/app/[locale]/school/more/exams/page.tsx` | OPEN |
| WR-030 | P10 | `/school/more/fee-settings` | Allowed | Fee settings, payer management, automatic billing and bank links, exact effective dates. | `apps/web/src/app/[locale]/school/more/fee-settings/page.tsx` | OPEN |
| WR-031 | P10 | `/school/more/finance-reports` | Admin/guardian allowed | Overview/report/Meine Zahlungen, current/selected month, totals, filters, charts, queues, export. | `apps/web/src/app/[locale]/school/more/finance-reports/page.tsx` | OPEN |
| WR-032 | P07 | `/school/more/grading` | Allowed | Homework gradebook, pupil rows, selected work, scores, status and actions. | `apps/web/src/app/[locale]/school/more/grading/page.tsx` | OPEN |
| WR-033 | P07 | `/school/more/homework` | Allowed | List/details, assignment, due date, submissions, feedback and published state. | `apps/web/src/app/[locale]/school/more/homework/page.tsx` | OPEN |
| WR-034 | P10 | `/school/more/invoices` | Admin/guardian allowed | Search, filter, list, selected invoice/student/period, payment links, PDF, cancellation/reissue. | `apps/web/src/app/[locale]/school/more/invoices/page.tsx` | OPEN |
| WR-035 | P10 | `/school/more/issue-invoices` | Allowed | Single pupil/class/school, monthly/extra, missing payer inline, ready/excluded counts, submit/results. | `apps/web/src/app/[locale]/school/more/issue-invoices/page.tsx` | OPEN |
| WR-036 | P08 | `/school/more/message-reports` | Allowed | Moderation queue, reported item, evidence, status, confirm and restrictions. | `apps/web/src/app/[locale]/school/more/message-reports/page.tsx` | OPEN |
| WR-037 | P08 | `/school/more/news` | Allowed | Feed/managed list, detail, create/edit, draft/published state. | `apps/web/src/app/[locale]/school/more/news/page.tsx` | OPEN |
| WR-038 | P08 | `/school/more/notifications` | All allowed | Unread/read, individual notice, mark-read, settings, resource landing. | `apps/web/src/app/[locale]/school/more/notifications/page.tsx` | OPEN |
| WR-039 | P07 | `/school/more/oversight` | Admin with both capabilities | Class index, class detail, published grades/evaluations, attendance, oversight empty/denied. | `apps/web/src/app/[locale]/school/more/oversight/page.tsx` | OPEN |
| WR-040 | P10 | `/school/more/receipts` | Admin/guardian allowed | Cashbook view, bank/transfer filters, receipt history/details, allocation, reversal, refund, export. | `apps/web/src/app/[locale]/school/more/receipts/page.tsx` | OPEN |
| WR-041 | P10 | `/school/more/record-payment` | Allowed | Simple and advanced, cash/bank, full/partial, same payer, invalid/stale, receipt and return context. | `apps/web/src/app/[locale]/school/more/record-payment/page.tsx` | OPEN |
| WR-042 | P07 | `/school/more/reports` | Allowed | Academic reports, pupil/date filters, report sections, source links. | `apps/web/src/app/[locale]/school/more/reports/page.tsx` | OPEN |
| WR-043 | P10 | `/school/more/stop-reviews` | Allowed | Exceptional settlement list/detail, monetary amounts, correction actions and outcomes. | `apps/web/src/app/[locale]/school/more/stop-reviews/page.tsx` | OPEN |
| WR-044 | P09 | `/school/more/timetable` | Allowed | Weekly plan, teacher/guardian/admin views, editor, day selection, empty/overlaps. | `apps/web/src/app/[locale]/school/more/timetable/page.tsx` | OPEN |
| WR-045 | P05 | `/school/students/import` | Allowed | Template download, upload, parsing, preview, invalid rows, job status and completion. | `apps/web/src/app/[locale]/school/students/import/page.tsx` | OPEN |
| WR-046 | P03 | `/staff/access` | Allowed | Capability controls, roles, permissions, effective dates, save, denied. | `apps/web/src/app/[locale]/staff/access/page.tsx` | OPEN |
| WR-047 | P05 | `/staff/invitations` | Allowed | Teacher/staff invitation, list/detail, batch status, resend and expired/bounced. | `apps/web/src/app/[locale]/staff/invitations/page.tsx` | OPEN |

### Dynamic tabs (expand, do not count as just one page)
| ID | Phase | Tab | Role | Scenes |
| --- | --- | --- | --- | --- |
| TAB-1 | P04 | `/school/home` | admin / teacher / guardian | Each role's home, setup-required, populated, low/no data, capability-limited, existing hero artwork. |
| TAB-2 | P05 | `/school/students` | admin students.manage | Family list, child/guardian/link/detail, add, import, direct invitation/batch, searches, filter and all dialogs. |
| TAB-3 | P06 | `/school/attendance` | teacher | Class/date/daily sheet, each row state, details, offline drafts, submission. |
| TAB-4 | P05 | `/school/children` | guardian | Zero/one/many children, selected child, child details and existing shortcuts; linked relationship/privacy. |
| TAB-5 | P08 | `/school/messages` | all allowed | Chat/feed sections, thread, pending/failed message, composer, attachments, voice, search. |
| TAB-6 | P09 | `/school/calendar` | all allowed | Calendar, selected item, add, read-only and editor; legacy messages calendar redirect. |
| TAB-7 | P04 | `/school/more` | all allowed | Every capability-filtered disclosure group and action, account controls, expanded/collapsed. |

### Dynamic keys, redirects, platform-only
- [ ] /school/home/queues/guardian_links: ready/zero/many/unavailable, exact target, filtering, role restriction.
- [ ] /school/home/queues/family_imports: ready/zero/many/unavailable, exact target, filtering, role restriction.
- [ ] /school/home/queues/class_assignments: ready/zero/many/unavailable, exact target, filtering, role restriction.
- [ ] /school/home/queues/bounced_invites: ready/zero/many/unavailable, exact target, filtering, role restriction.
- [ ] /school/home/queues/unapproved_attendance: ready/zero/many/unavailable, exact target, filtering, role restriction.
- [ ] /school/home/queues/noncontinuation_requests: ready/zero/many/unavailable, exact target, filtering, role restriction.
- [ ] /school/home/queues/settlement_review: ready/zero/many/unavailable, exact target, filtering, role restriction.
- [ ] /account/security/recover: success + missing/invalid/expired/replayed token.
- [ ] /account/security/email: success + missing/invalid/expired/replayed token.
- [ ] /account/security/activate: success + missing/invalid/expired/replayed token.
- [ ] /open/notice/[id]: verify exact resource destination and unavailable/unauthorized state.
- [ ] /open/thread/[id]: verify exact resource destination and unavailable/unauthorized state.
- [ ] /open/broadcast/[id]: verify exact resource destination and unavailable/unauthorized state.
- [ ] /open/child/[id]: verify exact resource destination and unavailable/unauthorized state.
- [ ] /open/attendance/[id]: verify exact resource destination and unavailable/unauthorized state.
- [ ] /open/exam/[id]: verify exact resource destination and unavailable/unauthorized state.
- [ ] /open/evaluation/[id]: verify exact resource destination and unavailable/unauthorized state.
- [ ] /open/activity/[id]: verify exact resource destination and unavailable/unauthorized state.
- [ ] /open/homework/[id]: verify exact resource destination and unavailable/unauthorized state.
- [ ] /open/invoice/[id]: verify exact resource destination and unavailable/unauthorized state.
- [ ] /open/receipt/[id]: verify exact resource destination and unavailable/unauthorized state.
- [ ] /open/fee_stop/[id]: verify exact resource destination and unavailable/unauthorized state.
- [ ] Root locale layout, school layout/loading, framework 404/error boundary, offline shell, browser navigation, session expiry and link return.
- [ ] /install, /download/android, /auth/android/callback: existing redirects/headers/download remain intact; inspect user-facing fallback and install UX; no visual change to non-rendering endpoints.
- [ ] /offline/attendance.html: locked/unlocked, saved offline, sync, conflicts, no connection, reconnect and errors. Keep vault and service worker semantics.
- [ ] All header menus, scope selection, app settings, notifications, confirmation dialogs, sheets/popovers, toasts, context menus, attachment viewers, PDF links and browser native date/picker affordances.

## Android declared WorkspacePage variants (41)
Source: `apps/android/app/src/main/java/de/madrasty/app/identity/SchoolWorkspace.kt`. Expand every constructor parameter and branch, including Tabs (all 7 tab destinations filtered by role), restricted session, MFA, release gate, sign-in/invitations, offline mode, push/deep-link unavailable, permission dialogs, keyboard, back/predictive back and system bars. Compare same business data with web while preserving native semantics.

| ID | Declaration | Status |
| --- | --- | --- |
| AN-001 | `data object Tabs` | OPEN |
| AN-002 | `data object Account` | OPEN |
| AN-003 | `data object Profile` | OPEN |
| AN-004 | `data object Security` | OPEN |
| AN-005 | `data object Directory` | OPEN |
| AN-006 | `data class Thread(val id:String)` | OPEN |
| AN-007 | `data object MessageReports` | OPEN |
| AN-008 | `data object Bank` | OPEN |
| AN-009 | `data class FeeSettings(val student: String? = null)` | OPEN |
| AN-010 | `data class IssueInvoices(val student: String? = null)` | OPEN |
| AN-011 | `data class Invoices(val id: String? = null, val student: String? = null, val period: String? = null)` | OPEN |
| AN-012 | `data class Payment(val invoice: String? = null)` | OPEN |
| AN-013 | `data class Receipts(val id: String? = null, val state: String? = null)` | OPEN |
| AN-014 | `data class FinanceReport(val student: String? = null)` | OPEN |
| AN-015 | `data class Stops(val id: String? = null, val student: String? = null)` | OPEN |
| AN-016 | `data class StopReviews(val id: String? = null)` | OPEN |
| AN-017 | `data class Broadcasts(val announcement:String?=null)` | OPEN |
| AN-018 | `data class Notifications(val notice:String?=null)` | OPEN |
| AN-019 | `data class ResourceUnavailable(val retry: SchoolResourceLink? = null)` | OPEN |
| AN-020 | `data class Publication(val section:PublicationSection,val item:String?=null,val create:Boolean=false,val managed:Boolean=false)` | OPEN |
| AN-021 | `data object Access` | OPEN |
| AN-022 | `data object Calendar` | OPEN |
| AN-023 | `data class Enrollment(val student:String?=null)` | OPEN |
| AN-024 | `data class AttendanceReview(val classId:String?=null,val date:String?=null)` | OPEN |
| AN-025 | `data class AttendanceHistory(val child:String?=null,val classId:String?=null,val rowId:String?=null)` | OPEN |
| AN-026 | `data object OfflineAttendance` | OPEN |
| AN-027 | `data class Excuse(val child: String,val date:String?=null)` | OPEN |
| AN-028 | `data class Curriculum(val child:String?=null,val lesson:String?=null)` | OPEN |
| AN-029 | `data class Homework(val child:String?=null,val work:String?=null)` | OPEN |
| AN-030 | `data class Gradebook(val work:String?=null)` | OPEN |
| AN-031 | `data class AcademicWork(val child:String?=null,val activity:String?=null)` | OPEN |
| AN-032 | `data class Report(val pupil:String?=null)` | OPEN |
| AN-033 | `data class Evaluations(val child:String?=null,val entry:String?=null)` | OPEN |
| AN-034 | `data class Exams(val child:String?=null,val entry:String?=null)` | OPEN |
| AN-035 | `data class Timetable(val child: String? = null)` | OPEN |
| AN-036 | `data class Invitations(val batch: String? = null, val id: String? = null)` | OPEN |
| AN-037 | `data class Import(val job: String? = null)` | OPEN |
| AN-038 | `data class Assignments(val classTarget: SchoolWorkTarget.ClassAssignment? = null)` | OPEN |
| AN-039 | `data class Family(val student: String? = null,val guardian: String? = null,val link: String? = null,val addGuardian:Boolean = false)` | OPEN |
| AN-040 | `data object AdminTasks` | OPEN |
| AN-041 | `data class Queue(val selection: WorkQueueSelection)` | OPEN |

## Web source sweep (183 files)
Review every rendered component and every string/style/asset in these sources. Logic-only files are inspect/preserve, not a request to modify logic. Nonvisual endpoint redirects, service-worker code and import templates are verify unchanged. Add any UI owner discovered outside this list.

| ID | Phase owner | Exact path | Status |
| --- | --- | --- | --- |
| WS-001 | P06 | `apps/web/public/attendance-vault.mjs` | OPEN |
| WS-002 | P02 | `apps/web/public/manifest.webmanifest` | OPEN |
| WS-003 | P08 | `apps/web/public/media/voice-capture.js` | OPEN |
| WS-004 | P11 | `apps/web/public/notebook-admin.svg` | OPEN |
| WS-005 | P11 | `apps/web/public/notebook-guardian.svg` | OPEN |
| WS-006 | P11 | `apps/web/public/notebook-teacher.svg` | OPEN |
| WS-007 | P06 | `apps/web/public/offline/attendance.css` | OPEN |
| WS-008 | P06 | `apps/web/public/offline/attendance.html` | OPEN |
| WS-009 | P06 | `apps/web/public/offline/attendance.mjs` | OPEN |
| WS-010 | P11 | `apps/web/public/school-180.png` | OPEN |
| WS-011 | P11 | `apps/web/public/school-192.png` | OPEN |
| WS-012 | P11 | `apps/web/public/school-512.png` | OPEN |
| WS-013 | P11 | `apps/web/public/school-sw.js` | OPEN |
| WS-014 | P11 | `apps/web/public/templates/family-import-groups.csv` | OPEN |
| WS-015 | P11 | `apps/web/public/templates/family-import.csv` | OPEN |
| WS-016 | P11 | `apps/web/public/templates/family-import.xlsx` | OPEN |
| WS-017 | P11 | `apps/web/src/app/.well-known/assetlinks.json/route.ts` | OPEN |
| WS-018 | P03 | `apps/web/src/app/[locale]/account/preferences/page.tsx` | OPEN |
| WS-019 | P03 | `apps/web/src/app/[locale]/account/profile/page.tsx` | OPEN |
| WS-020 | P03 | `apps/web/src/app/[locale]/account/security/[action]/page.tsx` | OPEN |
| WS-021 | P03 | `apps/web/src/app/[locale]/account/security/page.tsx` | OPEN |
| WS-022 | P03 | `apps/web/src/app/[locale]/account/sign-in/page.tsx` | OPEN |
| WS-023 | P08 | `apps/web/src/app/[locale]/directory/page.tsx` | OPEN |
| WS-024 | P03 | `apps/web/src/app/[locale]/install/page.tsx` | OPEN |
| WS-025 | P03 | `apps/web/src/app/[locale]/invite/page.tsx` | OPEN |
| WS-026 | P11 | `apps/web/src/app/[locale]/layout.tsx` | OPEN |
| WS-027 | P08 | `apps/web/src/app/[locale]/open-notice/[id]/page.tsx` | OPEN |
| WS-028 | P03 | `apps/web/src/app/[locale]/open/[kind]/[id]/page.tsx` | OPEN |
| WS-029 | P03 | `apps/web/src/app/[locale]/page.tsx` | OPEN |
| WS-030 | P04 | `apps/web/src/app/[locale]/school/[tab]/page.tsx` | OPEN |
| WS-031 | P06 | `apps/web/src/app/[locale]/school/children/[childId]/attendance/page.tsx` | OPEN |
| WS-032 | P06 | `apps/web/src/app/[locale]/school/children/[childId]/excuse/page.tsx` | OPEN |
| WS-033 | P04 | `apps/web/src/app/[locale]/school/home/queues/[key]/page.tsx` | OPEN |
| WS-034 | P04 | `apps/web/src/app/[locale]/school/home/tasks/page.tsx` | OPEN |
| WS-035 | P11 | `apps/web/src/app/[locale]/school/layout.tsx` | OPEN |
| WS-036 | P11 | `apps/web/src/app/[locale]/school/loading.tsx` | OPEN |
| WS-037 | P07 | `apps/web/src/app/[locale]/school/more/academics/page.tsx` | OPEN |
| WS-038 | P05 | `apps/web/src/app/[locale]/school/more/assignments/page.tsx` | OPEN |
| WS-039 | P06 | `apps/web/src/app/[locale]/school/more/attendance/history/page.tsx` | OPEN |
| WS-040 | P06 | `apps/web/src/app/[locale]/school/more/attendance/page.tsx` | OPEN |
| WS-041 | P10 | `apps/web/src/app/[locale]/school/more/bank/page.tsx` | OPEN |
| WS-042 | P08 | `apps/web/src/app/[locale]/school/more/broadcasts/page.tsx` | OPEN |
| WS-043 | P09 | `apps/web/src/app/[locale]/school/more/calendar/page.tsx` | OPEN |
| WS-044 | P05 | `apps/web/src/app/[locale]/school/more/classes/page.tsx` | OPEN |
| WS-045 | P07 | `apps/web/src/app/[locale]/school/more/curriculum/page.tsx` | OPEN |
| WS-046 | P10 | `apps/web/src/app/[locale]/school/more/enrollment-stops/page.tsx` | OPEN |
| WS-047 | P07 | `apps/web/src/app/[locale]/school/more/evaluations/page.tsx` | OPEN |
| WS-048 | P09 | `apps/web/src/app/[locale]/school/more/events/page.tsx` | OPEN |
| WS-049 | P07 | `apps/web/src/app/[locale]/school/more/exams/page.tsx` | OPEN |
| WS-050 | P10 | `apps/web/src/app/[locale]/school/more/fee-settings/page.tsx` | OPEN |
| WS-051 | P10 | `apps/web/src/app/[locale]/school/more/finance-reports/page.tsx` | OPEN |
| WS-052 | P07 | `apps/web/src/app/[locale]/school/more/grading/page.tsx` | OPEN |
| WS-053 | P07 | `apps/web/src/app/[locale]/school/more/homework/page.tsx` | OPEN |
| WS-054 | P10 | `apps/web/src/app/[locale]/school/more/invoices/page.tsx` | OPEN |
| WS-055 | P10 | `apps/web/src/app/[locale]/school/more/issue-invoices/page.tsx` | OPEN |
| WS-056 | P08 | `apps/web/src/app/[locale]/school/more/message-reports/page.tsx` | OPEN |
| WS-057 | P08 | `apps/web/src/app/[locale]/school/more/news/page.tsx` | OPEN |
| WS-058 | P08 | `apps/web/src/app/[locale]/school/more/notifications/page.tsx` | OPEN |
| WS-059 | P07 | `apps/web/src/app/[locale]/school/more/oversight/page.tsx` | OPEN |
| WS-060 | P10 | `apps/web/src/app/[locale]/school/more/receipts/page.tsx` | OPEN |
| WS-061 | P10 | `apps/web/src/app/[locale]/school/more/record-payment/page.tsx` | OPEN |
| WS-062 | P07 | `apps/web/src/app/[locale]/school/more/reports/page.tsx` | OPEN |
| WS-063 | P10 | `apps/web/src/app/[locale]/school/more/stop-reviews/page.tsx` | OPEN |
| WS-064 | P09 | `apps/web/src/app/[locale]/school/more/timetable/page.tsx` | OPEN |
| WS-065 | P05 | `apps/web/src/app/[locale]/school/students/import/page.tsx` | OPEN |
| WS-066 | P03 | `apps/web/src/app/[locale]/staff/access/page.tsx` | OPEN |
| WS-067 | P05 | `apps/web/src/app/[locale]/staff/invitations/page.tsx` | OPEN |
| WS-068 | P03 | `apps/web/src/app/auth/android/callback/route.ts` | OPEN |
| WS-069 | P03 | `apps/web/src/app/download/android/route.ts` | OPEN |
| WS-070 | P03 | `apps/web/src/app/install/route.ts` | OPEN |
| WS-071 | P02 | `apps/web/src/app/school.css` | OPEN |
| WS-072 | P07 | `apps/web/src/features/academics/AcademicReport.tsx` | OPEN |
| WS-073 | P07 | `apps/web/src/features/academics/AssessmentScope.tsx` | OPEN |
| WS-074 | P07 | `apps/web/src/features/academics/Curriculum.tsx` | OPEN |
| WS-075 | P07 | `apps/web/src/features/academics/Evaluations.tsx` | OPEN |
| WS-076 | P07 | `apps/web/src/features/academics/ExamMarks.tsx` | OPEN |
| WS-077 | P07 | `apps/web/src/features/academics/Exams.tsx` | OPEN |
| WS-078 | P07 | `apps/web/src/features/academics/Gradebook.tsx` | OPEN |
| WS-079 | P07 | `apps/web/src/features/academics/Homework.tsx` | OPEN |
| WS-080 | P07 | `apps/web/src/features/academics/TeachingActivity.tsx` | OPEN |
| WS-081 | P07 | `apps/web/src/features/academics/exam-copy.ts` | OPEN |
| WS-082 | P07 | `apps/web/src/features/academics/gradebook-context.ts` | OPEN |
| WS-083 | P07 | `apps/web/src/features/academics/shared.tsx` | OPEN |
| WS-084 | P06 | `apps/web/src/features/attendance/AttendanceHistory.tsx` | OPEN |
| WS-085 | P06 | `apps/web/src/features/attendance/CachedAttendance.tsx` | OPEN |
| WS-086 | P06 | `apps/web/src/features/attendance/DailySheet.tsx` | OPEN |
| WS-087 | P06 | `apps/web/src/features/attendance/FamilyExcuse.tsx` | OPEN |
| WS-088 | P06 | `apps/web/src/features/attendance/LiveAttendance.ts` | OPEN |
| WS-089 | P06 | `apps/web/src/features/attendance/RowDetails.tsx` | OPEN |
| WS-090 | P06 | `apps/web/src/features/attendance/daily-context.ts` | OPEN |
| WS-091 | P06 | `apps/web/src/features/attendance/draft-store.ts` | OPEN |
| WS-092 | P06 | `apps/web/src/features/attendance/history-context.ts` | OPEN |
| WS-093 | P06 | `apps/web/src/features/attendance/useAttendanceDrafts.ts` | OPEN |
| WS-094 | P08 | `apps/web/src/features/comms/BroadcastComposer.tsx` | OPEN |
| WS-095 | P08 | `apps/web/src/features/comms/CommunicationHub.tsx` | OPEN |
| WS-096 | P08 | `apps/web/src/features/comms/Conversation.tsx` | OPEN |
| WS-097 | P08 | `apps/web/src/features/comms/MediaComposer.tsx` | OPEN |
| WS-098 | P08 | `apps/web/src/features/comms/NotificationCenter.tsx` | OPEN |
| WS-099 | P08 | `apps/web/src/features/comms/ReportQueue.tsx` | OPEN |
| WS-100 | P08 | `apps/web/src/features/comms/SchoolPublishing.tsx` | OPEN |
| WS-101 | P08 | `apps/web/src/features/comms/SharedChatMedia.tsx` | OPEN |
| WS-102 | P08 | `apps/web/src/features/comms/StartConversation.tsx` | OPEN |
| WS-103 | P08 | `apps/web/src/features/comms/ThreadInbox.tsx` | OPEN |
| WS-104 | P08 | `apps/web/src/features/comms/VoiceDraftPreview.tsx` | OPEN |
| WS-105 | P08 | `apps/web/src/features/comms/capture.ts` | OPEN |
| WS-106 | P08 | `apps/web/src/features/comms/chat-drafts.ts` | OPEN |
| WS-107 | P08 | `apps/web/src/features/comms/chat-state.ts` | OPEN |
| WS-108 | P08 | `apps/web/src/features/comms/inbox-context.ts` | OPEN |
| WS-109 | P08 | `apps/web/src/features/comms/push-device.ts` | OPEN |
| WS-110 | P08 | `apps/web/src/features/comms/useChatUnreadCount.ts` | OPEN |
| WS-111 | P08 | `apps/web/src/features/comms/voice-waveform.ts` | OPEN |
| WS-112 | P10 | `apps/web/src/features/finance/AutomaticBilling.tsx` | OPEN |
| WS-113 | P10 | `apps/web/src/features/finance/BankSettings.tsx` | OPEN |
| WS-114 | P10 | `apps/web/src/features/finance/Cashbook.tsx` | OPEN |
| WS-115 | P10 | `apps/web/src/features/finance/FeeSettings.tsx` | OPEN |
| WS-116 | P10 | `apps/web/src/features/finance/FinanceDateField.tsx` | OPEN |
| WS-117 | P10 | `apps/web/src/features/finance/FinanceNavigation.tsx` | OPEN |
| WS-118 | P10 | `apps/web/src/features/finance/FinanceOverview.tsx` | OPEN |
| WS-119 | P10 | `apps/web/src/features/finance/FinanceReports.tsx` | OPEN |
| WS-120 | P10 | `apps/web/src/features/finance/FinanceWorkspace.module.css` | OPEN |
| WS-121 | P10 | `apps/web/src/features/finance/InvoiceDetails.tsx` | OPEN |
| WS-122 | P10 | `apps/web/src/features/finance/IssueInvoices.tsx` | OPEN |
| WS-123 | P10 | `apps/web/src/features/finance/ReceiptDetails.tsx` | OPEN |
| WS-124 | P10 | `apps/web/src/features/finance/Reconciliation.tsx` | OPEN |
| WS-125 | P10 | `apps/web/src/features/finance/RecordPayment.tsx` | OPEN |
| WS-126 | P10 | `apps/web/src/features/finance/StopQueue.tsx` | OPEN |
| WS-127 | P10 | `apps/web/src/features/finance/StopRequest.tsx` | OPEN |
| WS-128 | P10 | `apps/web/src/features/finance/StopReview.tsx` | OPEN |
| WS-129 | P10 | `apps/web/src/features/finance/TransferDetails.tsx` | OPEN |
| WS-130 | P10 | `apps/web/src/features/finance/invoice-ui.tsx` | OPEN |
| WS-131 | P10 | `apps/web/src/features/finance/receipt-ui.tsx` | OPEN |
| WS-132 | P10 | `apps/web/src/features/finance/report-context.ts` | OPEN |
| WS-133 | P10 | `apps/web/src/features/finance/stop-ui.tsx` | OPEN |
| WS-134 | P03 | `apps/web/src/features/identity/AccountPreferences.tsx` | OPEN |
| WS-135 | P08 | `apps/web/src/features/identity/ContactDirectory.tsx` | OPEN |
| WS-136 | P05 | `apps/web/src/features/identity/GuardianInviteManager.tsx` | OPEN |
| WS-137 | P05 | `apps/web/src/features/identity/Invitations.tsx` | OPEN |
| WS-138 | P03 | `apps/web/src/features/identity/ProfileEditor.tsx` | OPEN |
| WS-139 | P03 | `apps/web/src/features/identity/SecurityForms.tsx` | OPEN |
| WS-140 | P03 | `apps/web/src/features/identity/SessionControls.tsx` | OPEN |
| WS-141 | P03 | `apps/web/src/features/identity/StaffAccess.tsx` | OPEN |
| WS-142 | P07 | `apps/web/src/features/school/AdminClassMonitor.module.css` | OPEN |
| WS-143 | P07 | `apps/web/src/features/school/AdminClassMonitor.tsx` | OPEN |
| WS-144 | P07 | `apps/web/src/features/school/AdminTeachingOverview.module.css` | OPEN |
| WS-145 | P07 | `apps/web/src/features/school/AdminTeachingOverview.tsx` | OPEN |
| WS-146 | P09 | `apps/web/src/features/school/Calendar.module.css` | OPEN |
| WS-147 | P09 | `apps/web/src/features/school/Calendar.tsx` | OPEN |
| WS-148 | P05 | `apps/web/src/features/school/ClassTeachersPanel.tsx` | OPEN |
| WS-149 | P05 | `apps/web/src/features/school/DirectStaffForm.tsx` | OPEN |
| WS-150 | P05 | `apps/web/src/features/school/Enrollments.tsx` | OPEN |
| WS-151 | P05 | `apps/web/src/features/school/Families.tsx` | OPEN |
| WS-152 | P05 | `apps/web/src/features/school/FamilyGroups.tsx` | OPEN |
| WS-153 | P05 | `apps/web/src/features/school/FamilyImport.tsx` | OPEN |
| WS-154 | P05 | `apps/web/src/features/school/FamilyPeople.tsx` | OPEN |
| WS-155 | P05 | `apps/web/src/features/school/NewFamily.tsx` | OPEN |
| WS-156 | P04 | `apps/web/src/features/school/SchoolHome.tsx` | OPEN |
| WS-157 | P05 | `apps/web/src/features/school/StaffAssignments.tsx` | OPEN |
| WS-158 | P05 | `apps/web/src/features/school/StaffProvisionOnly.tsx` | OPEN |
| WS-159 | P05 | `apps/web/src/features/school/StaffWorkspace.module.css` | OPEN |
| WS-160 | P05 | `apps/web/src/features/school/StaffWorkspace.tsx` | OPEN |
| WS-161 | P04 | `apps/web/src/features/school/WorkQueues.tsx` | OPEN |
| WS-162 | P09 | `apps/web/src/features/school/calendar-model.ts` | OPEN |
| WS-163 | P11 | `apps/web/src/features/school/directory-filter-state.ts` | OPEN |
| WS-164 | P11 | `apps/web/src/features/school/resourceDestination.ts` | OPEN |
| WS-165 | P09 | `apps/web/src/features/school/timetable/Timetable.module.css` | OPEN |
| WS-166 | P09 | `apps/web/src/features/school/timetable/Timetable.tsx` | OPEN |
| WS-167 | P09 | `apps/web/src/features/school/timetable/TimetableEditor.tsx` | OPEN |
| WS-168 | P05 | `apps/web/src/features/school/timetable/shared.tsx` | OPEN |
| WS-169 | P11 | `apps/web/src/i18n/ar.json` | OPEN |
| WS-170 | P11 | `apps/web/src/i18n/de.json` | OPEN |
| WS-171 | P11 | `apps/web/src/i18n/index.ts` | OPEN |
| WS-172 | P11 | `apps/web/src/i18n/presentation.ts` | OPEN |
| WS-173 | P02 | `apps/web/src/ui/AccountScope.tsx` | OPEN |
| WS-174 | P02 | `apps/web/src/ui/AppSettingsSheet.tsx` | OPEN |
| WS-175 | P02 | `apps/web/src/ui/AsyncSurface.tsx` | OPEN |
| WS-176 | P02 | `apps/web/src/ui/Icon.tsx` | OPEN |
| WS-177 | P02 | `apps/web/src/ui/MoreBackLink.tsx` | OPEN |
| WS-178 | P02 | `apps/web/src/ui/MoreGroup.tsx` | OPEN |
| WS-179 | P02 | `apps/web/src/ui/PresentationLanguage.tsx` | OPEN |
| WS-180 | P02 | `apps/web/src/ui/RecordValues.tsx` | OPEN |
| WS-181 | P02 | `apps/web/src/ui/RoleHero.tsx` | OPEN |
| WS-182 | P02 | `apps/web/src/ui/SchoolLink.tsx` | OPEN |
| WS-183 | P02 | `apps/web/src/ui/Shell.tsx` | OPEN |

## Android source/resource sweep (143 files)
Every Kotlin file is accounted for, including nonvisual data/navigation code marked inspect/preserve by implementer. Review every resource string and drawable; do not edit session/auth/transport/cache/navigation behavior. Existing notebook and school seal are protected assets.

| ID | Phase owner | Exact path | Status |
| --- | --- | --- | --- |
| AS-001 | P02 | `apps/android/app/src/main/java/de/madrasty/app/MainActivity.kt` | OPEN |
| AS-002 | P07 | `apps/android/app/src/main/java/de/madrasty/app/academics/AcademicReportScreen.kt` | OPEN |
| AS-003 | P07 | `apps/android/app/src/main/java/de/madrasty/app/academics/ActivityWork.kt` | OPEN |
| AS-004 | P07 | `apps/android/app/src/main/java/de/madrasty/app/academics/AssessmentScope.kt` | OPEN |
| AS-005 | P07 | `apps/android/app/src/main/java/de/madrasty/app/academics/CurriculumScreen.kt` | OPEN |
| AS-006 | P07 | `apps/android/app/src/main/java/de/madrasty/app/academics/EvaluationScreen.kt` | OPEN |
| AS-007 | P07 | `apps/android/app/src/main/java/de/madrasty/app/academics/ExamMarksScreen.kt` | OPEN |
| AS-008 | P07 | `apps/android/app/src/main/java/de/madrasty/app/academics/ExamScreen.kt` | OPEN |
| AS-009 | P07 | `apps/android/app/src/main/java/de/madrasty/app/academics/GradebookScreen.kt` | OPEN |
| AS-010 | P07 | `apps/android/app/src/main/java/de/madrasty/app/academics/HomeworkScreen.kt` | OPEN |
| AS-011 | P07 | `apps/android/app/src/main/java/de/madrasty/app/academics/ReportBody.kt` | OPEN |
| AS-012 | P07 | `apps/android/app/src/main/java/de/madrasty/app/academics/TeachingActivityScreen.kt` | OPEN |
| AS-013 | P11 | `apps/android/app/src/main/java/de/madrasty/app/api/Wire.kt` | OPEN |
| AS-014 | P06 | `apps/android/app/src/main/java/de/madrasty/app/attendance/AttendanceDraftController.kt` | OPEN |
| AS-015 | P06 | `apps/android/app/src/main/java/de/madrasty/app/attendance/AttendanceDraftStore.kt` | OPEN |
| AS-016 | P06 | `apps/android/app/src/main/java/de/madrasty/app/attendance/AttendanceHistoryScreen.kt` | OPEN |
| AS-017 | P06 | `apps/android/app/src/main/java/de/madrasty/app/attendance/AttendanceRowDetails.kt` | OPEN |
| AS-018 | P06 | `apps/android/app/src/main/java/de/madrasty/app/attendance/DailySheetScreen.kt` | OPEN |
| AS-019 | P06 | `apps/android/app/src/main/java/de/madrasty/app/attendance/FamilyExcuseScreen.kt` | OPEN |
| AS-020 | P06 | `apps/android/app/src/main/java/de/madrasty/app/attendance/OfflineAttendanceScreen.kt` | OPEN |
| AS-021 | P08 | `apps/android/app/src/main/java/de/madrasty/app/comms/AndroidPushBinding.kt` | OPEN |
| AS-022 | P08 | `apps/android/app/src/main/java/de/madrasty/app/comms/BroadcastComposer.kt` | OPEN |
| AS-023 | P08 | `apps/android/app/src/main/java/de/madrasty/app/comms/CommunicationFeed.kt` | OPEN |
| AS-024 | P08 | `apps/android/app/src/main/java/de/madrasty/app/comms/Conversation.kt` | OPEN |
| AS-025 | P08 | `apps/android/app/src/main/java/de/madrasty/app/comms/MediaCapture.kt` | OPEN |
| AS-026 | P08 | `apps/android/app/src/main/java/de/madrasty/app/comms/MediaComposer.kt` | OPEN |
| AS-027 | P08 | `apps/android/app/src/main/java/de/madrasty/app/comms/MediaTransfer.kt` | OPEN |
| AS-028 | P08 | `apps/android/app/src/main/java/de/madrasty/app/comms/NotificationCenter.kt` | OPEN |
| AS-029 | P08 | `apps/android/app/src/main/java/de/madrasty/app/comms/ReportQueue.kt` | OPEN |
| AS-030 | P08 | `apps/android/app/src/main/java/de/madrasty/app/comms/SchoolMessagingService.kt` | OPEN |
| AS-031 | P08 | `apps/android/app/src/main/java/de/madrasty/app/comms/SchoolPublishing.kt` | OPEN |
| AS-032 | P08 | `apps/android/app/src/main/java/de/madrasty/app/comms/StartConversation.kt` | OPEN |
| AS-033 | P08 | `apps/android/app/src/main/java/de/madrasty/app/comms/ThreadInbox.kt` | OPEN |
| AS-034 | P08 | `apps/android/app/src/main/java/de/madrasty/app/comms/VoiceWaveform.kt` | OPEN |
| AS-035 | P10 | `apps/android/app/src/main/java/de/madrasty/app/finance/BankSettings.kt` | OPEN |
| AS-036 | P10 | `apps/android/app/src/main/java/de/madrasty/app/finance/FeeSettings.kt` | OPEN |
| AS-037 | P10 | `apps/android/app/src/main/java/de/madrasty/app/finance/FinanceExtras.kt` | OPEN |
| AS-038 | P10 | `apps/android/app/src/main/java/de/madrasty/app/finance/FinancePresentation.kt` | OPEN |
| AS-039 | P10 | `apps/android/app/src/main/java/de/madrasty/app/finance/FinanceReports.kt` | OPEN |
| AS-040 | P10 | `apps/android/app/src/main/java/de/madrasty/app/finance/InvoiceDetails.kt` | OPEN |
| AS-041 | P10 | `apps/android/app/src/main/java/de/madrasty/app/finance/InvoiceUi.kt` | OPEN |
| AS-042 | P10 | `apps/android/app/src/main/java/de/madrasty/app/finance/IssueInvoices.kt` | OPEN |
| AS-043 | P10 | `apps/android/app/src/main/java/de/madrasty/app/finance/ReceiptDetails.kt` | OPEN |
| AS-044 | P10 | `apps/android/app/src/main/java/de/madrasty/app/finance/Reconciliation.kt` | OPEN |
| AS-045 | P10 | `apps/android/app/src/main/java/de/madrasty/app/finance/RecordPayment.kt` | OPEN |
| AS-046 | P10 | `apps/android/app/src/main/java/de/madrasty/app/finance/StopQueue.kt` | OPEN |
| AS-047 | P10 | `apps/android/app/src/main/java/de/madrasty/app/finance/StopRequest.kt` | OPEN |
| AS-048 | P10 | `apps/android/app/src/main/java/de/madrasty/app/finance/StopReview.kt` | OPEN |
| AS-049 | P10 | `apps/android/app/src/main/java/de/madrasty/app/finance/TransferDetails.kt` | OPEN |
| AS-050 | P03 | `apps/android/app/src/main/java/de/madrasty/app/identity/AccountScreen.kt` | OPEN |
| AS-051 | P03 | `apps/android/app/src/main/java/de/madrasty/app/identity/AuthRepository.kt` | OPEN |
| AS-052 | P08 | `apps/android/app/src/main/java/de/madrasty/app/identity/DirectoryScreen.kt` | OPEN |
| AS-053 | P03 | `apps/android/app/src/main/java/de/madrasty/app/identity/InvitationScreens.kt` | OPEN |
| AS-054 | P03 | `apps/android/app/src/main/java/de/madrasty/app/identity/ProfileScreen.kt` | OPEN |
| AS-055 | P03 | `apps/android/app/src/main/java/de/madrasty/app/identity/SchoolWorkspace.kt` | OPEN |
| AS-056 | P03 | `apps/android/app/src/main/java/de/madrasty/app/identity/SecurityScreen.kt` | OPEN |
| AS-057 | P03 | `apps/android/app/src/main/java/de/madrasty/app/identity/SessionStore.kt` | OPEN |
| AS-058 | P03 | `apps/android/app/src/main/java/de/madrasty/app/identity/SignInScreen.kt` | OPEN |
| AS-059 | P03 | `apps/android/app/src/main/java/de/madrasty/app/identity/StaffAccessScreen.kt` | OPEN |
| AS-060 | P03 | `apps/android/app/src/main/java/de/madrasty/app/navigation/GeneratedSchoolContract.kt` | OPEN |
| AS-061 | P03 | `apps/android/app/src/main/java/de/madrasty/app/navigation/ReleaseVersionGate.kt` | OPEN |
| AS-062 | P03 | `apps/android/app/src/main/java/de/madrasty/app/navigation/SchoolRoutes.kt` | OPEN |
| AS-063 | P09 | `apps/android/app/src/main/java/de/madrasty/app/school/CalendarScreen.kt` | OPEN |
| AS-064 | P05 | `apps/android/app/src/main/java/de/madrasty/app/school/EnrollmentScreen.kt` | OPEN |
| AS-065 | P05 | `apps/android/app/src/main/java/de/madrasty/app/school/FamiliesScreen.kt` | OPEN |
| AS-066 | P05 | `apps/android/app/src/main/java/de/madrasty/app/school/FamilyGroupScreen.kt` | OPEN |
| AS-067 | P05 | `apps/android/app/src/main/java/de/madrasty/app/school/FamilyWizard.kt` | OPEN |
| AS-068 | P05 | `apps/android/app/src/main/java/de/madrasty/app/school/ImportScreen.kt` | OPEN |
| AS-069 | P04 | `apps/android/app/src/main/java/de/madrasty/app/school/SchoolHomeScreen.kt` | OPEN |
| AS-070 | P05 | `apps/android/app/src/main/java/de/madrasty/app/school/StaffAssignmentsScreen.kt` | OPEN |
| AS-071 | P09 | `apps/android/app/src/main/java/de/madrasty/app/school/TimetableEditor.kt` | OPEN |
| AS-072 | P09 | `apps/android/app/src/main/java/de/madrasty/app/school/TimetableScreen.kt` | OPEN |
| AS-073 | P02 | `apps/android/app/src/main/java/de/madrasty/app/ui/AsyncSurface.kt` | OPEN |
| AS-074 | P11 | `apps/android/app/src/main/java/de/madrasty/app/ui/InterfaceLanguage.kt` | OPEN |
| AS-075 | P02 | `apps/android/app/src/main/java/de/madrasty/app/ui/RecordValues.kt` | OPEN |
| AS-076 | P02 | `apps/android/app/src/main/java/de/madrasty/app/ui/RoleHero.kt` | OPEN |
| AS-077 | P02 | `apps/android/app/src/main/java/de/madrasty/app/ui/SchoolShell.kt` | OPEN |
| AS-078 | P02 | `apps/android/app/src/main/java/de/madrasty/app/ui/SchoolTheme.kt` | OPEN |
| AS-079 | P11 | `apps/android/app/src/main/res/drawable-nodpi/notebook_admin.png` | OPEN |
| AS-080 | P11 | `apps/android/app/src/main/res/drawable-nodpi/notebook_guardian.png` | OPEN |
| AS-081 | P11 | `apps/android/app/src/main/res/drawable-nodpi/notebook_teacher.png` | OPEN |
| AS-082 | P11 | `apps/android/app/src/main/res/drawable-nodpi/school_seal.png` | OPEN |
| AS-083 | P11 | `apps/android/app/src/main/res/drawable/ic_attendance.xml` | OPEN |
| AS-084 | P11 | `apps/android/app/src/main/res/drawable/ic_bell.xml` | OPEN |
| AS-085 | P11 | `apps/android/app/src/main/res/drawable/ic_calendar.xml` | OPEN |
| AS-086 | P11 | `apps/android/app/src/main/res/drawable/ic_comms_add.xml` | OPEN |
| AS-087 | P11 | `apps/android/app/src/main/res/drawable/ic_comms_back.xml` | OPEN |
| AS-088 | P11 | `apps/android/app/src/main/res/drawable/ic_comms_compose.xml` | OPEN |
| AS-089 | P11 | `apps/android/app/src/main/res/drawable/ic_comms_mic.xml` | OPEN |
| AS-090 | P11 | `apps/android/app/src/main/res/drawable/ic_comms_mute.xml` | OPEN |
| AS-091 | P11 | `apps/android/app/src/main/res/drawable/ic_comms_pin.xml` | OPEN |
| AS-092 | P11 | `apps/android/app/src/main/res/drawable/ic_comms_retry.xml` | OPEN |
| AS-093 | P11 | `apps/android/app/src/main/res/drawable/ic_comms_search.xml` | OPEN |
| AS-094 | P11 | `apps/android/app/src/main/res/drawable/ic_comms_send.xml` | OPEN |
| AS-095 | P11 | `apps/android/app/src/main/res/drawable/ic_home.xml` | OPEN |
| AS-096 | P11 | `apps/android/app/src/main/res/drawable/ic_messages.xml` | OPEN |
| AS-097 | P11 | `apps/android/app/src/main/res/drawable/ic_more.xml` | OPEN |
| AS-098 | P11 | `apps/android/app/src/main/res/drawable/ic_people.xml` | OPEN |
| AS-099 | P11 | `apps/android/app/src/main/res/drawable/ic_settings.xml` | OPEN |
| AS-100 | P03 | `apps/android/app/src/main/res/values-de/account.xml` | OPEN |
| AS-101 | P04 | `apps/android/app/src/main/res/values-de/admin_start.xml` | OPEN |
| AS-102 | P11 | `apps/android/app/src/main/res/values-de/attendance.xml` | OPEN |
| AS-103 | P11 | `apps/android/app/src/main/res/values-de/comms-compose.xml` | OPEN |
| AS-104 | P05 | `apps/android/app/src/main/res/values-de/enrollment.xml` | OPEN |
| AS-105 | P11 | `apps/android/app/src/main/res/values-de/excuses.xml` | OPEN |
| AS-106 | P05 | `apps/android/app/src/main/res/values-de/families.xml` | OPEN |
| AS-107 | P05 | `apps/android/app/src/main/res/values-de/family_import.xml` | OPEN |
| AS-108 | P05 | `apps/android/app/src/main/res/values-de/family_management.xml` | OPEN |
| AS-109 | P11 | `apps/android/app/src/main/res/values-de/identity.xml` | OPEN |
| AS-110 | P05 | `apps/android/app/src/main/res/values-de/invitations.xml` | OPEN |
| AS-111 | P11 | `apps/android/app/src/main/res/values-de/offline_attendance.xml` | OPEN |
| AS-112 | P03 | `apps/android/app/src/main/res/values-de/profile.xml` | OPEN |
| AS-113 | P11 | `apps/android/app/src/main/res/values-de/school_calendar.xml` | OPEN |
| AS-114 | P05 | `apps/android/app/src/main/res/values-de/school_setup.xml` | OPEN |
| AS-115 | P03 | `apps/android/app/src/main/res/values-de/security.xml` | OPEN |
| AS-116 | P11 | `apps/android/app/src/main/res/values-de/settings_groups.xml` | OPEN |
| AS-117 | P03 | `apps/android/app/src/main/res/values-de/staff_access.xml` | OPEN |
| AS-118 | P11 | `apps/android/app/src/main/res/values-de/strings.xml` | OPEN |
| AS-119 | P05 | `apps/android/app/src/main/res/values-de/timetable.xml` | OPEN |
| AS-120 | P04 | `apps/android/app/src/main/res/values-de/work_queues.xml` | OPEN |
| AS-121 | P03 | `apps/android/app/src/main/res/values/account.xml` | OPEN |
| AS-122 | P04 | `apps/android/app/src/main/res/values/admin_start.xml` | OPEN |
| AS-123 | P11 | `apps/android/app/src/main/res/values/attendance.xml` | OPEN |
| AS-124 | P11 | `apps/android/app/src/main/res/values/comms-compose.xml` | OPEN |
| AS-125 | P05 | `apps/android/app/src/main/res/values/enrollment.xml` | OPEN |
| AS-126 | P11 | `apps/android/app/src/main/res/values/excuses.xml` | OPEN |
| AS-127 | P05 | `apps/android/app/src/main/res/values/families.xml` | OPEN |
| AS-128 | P05 | `apps/android/app/src/main/res/values/family_import.xml` | OPEN |
| AS-129 | P05 | `apps/android/app/src/main/res/values/family_management.xml` | OPEN |
| AS-130 | P11 | `apps/android/app/src/main/res/values/identity.xml` | OPEN |
| AS-131 | P05 | `apps/android/app/src/main/res/values/invitations.xml` | OPEN |
| AS-132 | P11 | `apps/android/app/src/main/res/values/offline_attendance.xml` | OPEN |
| AS-133 | P03 | `apps/android/app/src/main/res/values/profile.xml` | OPEN |
| AS-134 | P11 | `apps/android/app/src/main/res/values/school_calendar.xml` | OPEN |
| AS-135 | P05 | `apps/android/app/src/main/res/values/school_setup.xml` | OPEN |
| AS-136 | P03 | `apps/android/app/src/main/res/values/security.xml` | OPEN |
| AS-137 | P11 | `apps/android/app/src/main/res/values/settings_groups.xml` | OPEN |
| AS-138 | P03 | `apps/android/app/src/main/res/values/staff_access.xml` | OPEN |
| AS-139 | P11 | `apps/android/app/src/main/res/values/strings.xml` | OPEN |
| AS-140 | P05 | `apps/android/app/src/main/res/values/timetable.xml` | OPEN |
| AS-141 | P04 | `apps/android/app/src/main/res/values/work_queues.xml` | OPEN |
| AS-142 | P11 | `apps/android/app/src/main/res/xml/chat_camera_paths.xml` | OPEN |
| AS-143 | P11 | `apps/android/app/src/main/res/xml/locales_config.xml` | OPEN |

## Existing visual/behavior tests (49 files)
- `apps/android/app/src/androidTest/java/de/madrasty/app/comms/CommunicationVisualTest.kt`
- `apps/android/app/src/androidTest/java/de/madrasty/app/finance/FinanceVisualTest.kt`
- `apps/android/app/src/androidTest/java/de/madrasty/app/school/FamilyVisualTest.kt`
- `apps/android/app/src/androidTest/java/de/madrasty/app/school/LanguageStateTest.kt`
- `qa/performance/api-baseline.test.ts`
- `qa/performance/dashboard-reads.test.mjs`
- `qa/performance/shared-paths.test.mjs`
- `qa/screenshot-audit-policy.mjs`
- `qa/screenshot-audit-policy.test.mjs`
- `qa/ui-attendance-ready.config.ts`
- `qa/ui-compatibility.config.ts`
- `qa/ui-finance-ios.config.ts`
- `qa/ui-finance-populated.config.ts`
- `qa/ui-remediation.config.ts`
- `qa/web/admin-mfa.spec.ts`
- `qa/web/attendance-offline.spec.ts`
- `qa/web/role-pages.spec.ts`
- `qa/web/ui-academic-empty.spec.ts`
- `qa/web/ui-acceptance-matrix.spec.ts`
- `qa/web/ui-admin-oversight.spec.ts`
- `qa/web/ui-admin-start-redesign.spec.ts`
- `qa/web/ui-attendance-ready.spec.ts`
- `qa/web/ui-bottom-nav.spec.ts`
- `qa/web/ui-calendar-preview.spec.ts`
- `qa/web/ui-communication-chat.spec.ts`
- `qa/web/ui-communication-visual-audit.spec.ts`
- `qa/web/ui-date-locale.spec.ts`
- `qa/web/ui-desktop-layout.spec.ts`
- `qa/web/ui-empty-states.spec.ts`
- `qa/web/ui-family-management.spec.ts`
- `qa/web/ui-finance-mobile-ux.spec.ts`
- `qa/web/ui-finance-populated.spec.ts`
- `qa/web/ui-fixture-names.spec.ts`
- `qa/web/ui-guardian-children.spec.ts`
- `qa/web/ui-guided-workflows.spec.ts`
- `qa/web/ui-header.spec.ts`
- `qa/web/ui-language-state.spec.ts`
- `qa/web/ui-long-names.spec.ts`
- `qa/web/ui-more-back.spec.ts`
- `qa/web/ui-more-disclosure.spec.ts`
- `qa/web/ui-motion-contract.spec.ts`
- `qa/web/ui-native-controls.spec.ts`
- `qa/web/ui-native-foundation.spec.ts`
- `qa/web/ui-navigation-pending.spec.ts`
- `qa/web/ui-performance.spec.ts`
- `qa/web/ui-scope-sheet.spec.ts`
- `qa/web/ui-terminal-state.spec.ts`
- `qa/web/ui-thread-inbox.spec.ts`
- `qa/web/ui-work-queues-ready.spec.ts`
Also inspect `qa/fixtures/school.ts`, all QA configs and workflow gates, `docs/ui-remediation/{ISSUES,STATUS,ACCEPTANCE,MOTION_REVIEW}.md`, and existing specs/plans. Do not treat old screenshot counts as evidence for this project.

## Coverage ledger required during implementation
Create `docs/visual-polish/SCENES.json` with stable IDs for every authorized persona/capability/locale/platform/route/query/state; `ELEMENTS.json` with every visible text key or inline literal, icon, field, badge, table cell template, link, control, dialog, state, and owner source. Include origin route, existing accessible name, target/action, visual component, states, before/after evidence and result. For repeated data rows record the template plus representative first/last/long/empty rows. Every branch must be captured or explained as nonrendering/not applicable with source proof. No screenshots of real family/student data. Deduplicate only if source and rendered state really are equivalent; keep aliases in registry. Re-run tree/AST discovery at every phase and final HEAD; fail coverage if new source or route is unclassified. Preserve exact prior strings/actions by default.