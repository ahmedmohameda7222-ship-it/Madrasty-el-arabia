# Scene evidence ledger — incomplete

Source registry fingerprint: `bac870e6c25f59b80b5c1f92f17282acc6ba03946e5f42b8893c6cbdbb6f0d30`. Source discovery includes 130 scenes. This document maps exact scene IDs to specifically observed runtime evidence; the registry itself remains discovery-only. A row is **PARTIAL** if a narrow test case ran or an attempted test reached the scene, not if its entire required matrix is audited. **OPEN** means no specific evidence is recorded here, not that the feature is missing. No scene is marked complete. For each scene, the full `requiredVariants`, query parameters, source predicates and element variants in SCENES/ELEMENTS and the master plan still apply. Selected hosted synthetic screenshots have been downloaded and independently reviewed; other screenshots/traces remain in disposable runners. Neither screenshots nor test counts close a scene. Existing local evidence from earlier checkpoints stays in STATUS.md. Physical device and owner visual approval are open.

| Scene ID | Phase | Route / screen | State | Narrow evidence / remaining work |
| --- | --- | --- | --- | --- |
| WEB-.well-known/assetlinks.json-route | P11 | /.well-known/assetlinks.json | OPEN | No specifically verified state recorded in this ledger. |
| WR-001 | P03 | /[locale]/account/preferences | PARTIAL | Guardian DE 320 preference controls and unsaved theme selection; warmed P03 diagnostic passed (46082187416 Chromium). Save/error/locale/other roles still open. |
| WR-002 | P03 | /[locale]/account/profile | PARTIAL | Guardian DE 320 profile fields, warmed P03 diagnostic passed (46082187416 Chromium). Edit/save/error/long-name/device matrix open. |
| WR-003 | P03 | /[locale]/account/security/[action] | PARTIAL | AR/DE recover form and missing-token email/activation; warmed P03 diagnostic passed (46082187416 Chromium); valid/expired/replayed/submitting/success open. |
| WR-004 | P03 | /[locale]/account/security | PARTIAL | Six synthetic account-security cases per browser on 46093343149 passed (12/12), guardian/teacher/admin AAL1/AAL2, 320–1280, both locales/themes and 200% font, 48px minimum and zero horizontal overflow. Reviewed all 24 candidate PNGs; German mobile 200% heading fragmented without valid hyphenation, targeted presentation candidate 62ec5bb verified on both browsers in 46095641551 (all six security cases each; 390px break points 5/11, exact text unchanged, control scroll checks passed). Submit/error/MFA enrollment/physical-device matrix and matched baseline remain open. |
| WR-005 | P03 | /[locale]/account/sign-in | PARTIAL | Signed-out entry and identity tests 4/4 each browser on production build 46085892025; invalid credentials, MFA and authenticated production fixture remain open. |
| WR-006 | P08 | /[locale]/directory | PARTIAL | Guardian contact picker and full searchable directory original regression passed (46083875529 WebKit); all roles, terminal states and visual matrix open. |
| WR-007 | P03 | /[locale]/install | PARTIAL | Original signed-out entry passed 4/4 suite on production Chromium and WebKit 46085892025; intermittent dev first click and ready APK variants still open. |
| WR-008 | P03 | /[locale]/invite | PARTIAL | Missing-token terminal state passed production signed-out suite both browsers 46085892025; valid/expired/activation open. |
| WEB-[locale]-layout | P11 | /[locale] | OPEN | No specifically verified state recorded in this ledger. |
| WR-009 | P08 | /[locale]/open-notice/[id] | OPEN | No specifically verified state recorded in this ledger. |
| WR-010 | P03 | /[locale]/open/[kind]/[id] | OPEN | No specifically verified state recorded in this ledger. |
| WR-011 | P03 | /[locale] | PARTIAL | Original public entry journey passed production both browsers 46085892025; no dev flake waiver, repeated cold and device variants open. |
| WR-012 | P04 | /[locale]/school/[tab] | OPEN | No specifically verified state recorded in this ledger. |
| WR-013 | P06 | /[locale]/school/children/[childId]/attendance | PARTIAL | Guardian child attendance initial authorized page in both languages and both engines; normal/200% root reflow observed in 46101081057. Detail, record, offline and other fixtures open. |
| WR-014 | P06 | /[locale]/school/children/[childId]/excuse | PARTIAL | Guardian child excuse initial authorized page in both languages and both engines; normal/200% root reflow observed in 46101081057. Submit, withdraw, terminal and offline variants open. |
| WR-015 | P04 | /[locale]/school/home/queues/[key] | OPEN | No specifically verified state recorded in this ledger. |
| WR-016 | P04 | /[locale]/school/home/tasks | PARTIAL | Admin DE 390 task overview link and AR 320 date-preserving back navigation (46081553330, both browsers); unavailable and full state/capability matrix open. |
| WEB-[locale]/school-layout | P11 | /[locale]/school | OPEN | No specifically verified state recorded in this ledger. |
| WEB-[locale]/school-loading | P11 | /[locale]/school | PARTIAL | Chromium 46083875529 ui-navigation-pending:5 observed request held at boundary, visible link-pending OR route-loading, other nav remains usable, then actual messages ready. Does not isolate every loading scene; exact skeleton captures and full matrix open. |
| WR-017 | P07 | /[locale]/school/more/academics | PARTIAL | Admin legacy editor redirects to read-only oversight, asserted Chromium 46083875529 ui-academic-empty:48; actual teacher workspace and all state/device variants still open. |
| WR-018 | P05 | /[locale]/school/more/assignments | PARTIAL | Admin DE 390 light and AR 320 dark staff directory and direct-provision open/cancel, geometry/token colors (46082187416 Chromium); WebKit candidate and assignment/permission variants open. |
| WR-019 | P06 | /[locale]/school/more/attendance/history | OPEN | No specifically verified state recorded in this ledger. |
| WR-020 | P06 | /[locale]/school/more/attendance | PARTIAL | Admin legacy attendance editor redirects to oversight and cannot see confirmation action (Chromium 46083875529 ui-academic-empty:48); authorized teacher review UI and full variants open. |
| WR-021 | P10 | /[locale]/school/more/bank | PARTIAL | 46098654181 both engines reached actual admin review/retention, active-state equality, guardian API 403 and terminal noindex; confirmed contrast RED 1.00/1.14, German heading break and 26px overflow at 200%. Candidate 573e7a0 contrast/typography pending verification; overflow diagnostic and full variants open. |
| WR-022 | P08 | /[locale]/school/more/broadcasts | PARTIAL | German Admin 390px actual unsaved announcement, no default audience, draft retained across tabs and preview disabled (WebKit 46083875529 ui-communication-chat:139); publish, recipients and full visual matrix open. |
| WR-023 | P09 | /[locale]/school/more/calendar | PARTIAL | P09 calendar both locales/browsers candidate green (46085891935 and 46086031725), 8 images reviewed, contrast RED/GREEN 31/31 (46089905164). Further large-text nav and month/day variants open. |
| WR-024 | P05 | /[locale]/school/more/classes | PARTIAL | German Admin real class teacher directory, permanent-password onboarding persisted, assignment write 201 and additional teacher selection/cancel; Chromium 46083875529 ui-guided-workflows:79/125/167. Other roles, AR, devices, all states and matched visual review open. |
| WR-025 | P07 | /[locale]/school/more/curriculum | PARTIAL | Admin legacy curriculum editor redirected to read-only oversight, Chromium 46083875529 ui-academic-empty:48; actual teacher publication and all visual states open. |
| WR-026 | P10 | /[locale]/school/more/enrollment-stops | PARTIAL | Admin and Guardian advertised pause destinations (four DE/AR cases per engine); initial render and normal/200% root reflow observed in 46101081057. Actual pause, revoke and exceptional variants open. |
| WR-027 | P07 | /[locale]/school/more/evaluations | PARTIAL | German teacher empty evaluation list with no unauthorized action, Chromium 46083875529 ui-academic-empty:11; populated/draft/published and full matrix open. |
| WR-028 | P09 | /[locale]/school/more/events | PARTIAL | Legacy event bookmark returns HTTP 307 preserving item/month/day/class and opens actual calendar detail; WebKit 46083875529 ui-communication-chat:158. Redirect-only evidence, calendar destination coverage separate. |
| WR-029 | P07 | /[locale]/school/more/exams | PARTIAL | Arabic guardian empty exams and Arabic Admin legacy exam redirect to oversight, Chromium 46083875529 ui-academic-empty:11/31; teacher announced/published, populated and full device variants open. |
| WR-030 | P10 | /[locale]/school/more/fee-settings | PARTIAL | iPhone WebKit 46083875529 ui-finance-mobile-ux and populated suite 5/5, admin DE/AR 320/390/430/1280, fee tabs 44px geometry, auto switch and one heading, payer selection; other states and final matched visual review open. |
| WR-031 | P10 | /[locale]/school/more/finance-reports | PARTIAL | Finance UI iPhone WebKit 5/5, fresh domain 1/1; new P10 RED actual cash/invoice amount/state verified all four locale/browser cases 46086031725, source candidate 961ee5e green all four cases 46089353407; 16 actual P10 PNGs reviewed; finance tab word fragmentation follow-up and full ready overview remain open. |
| WR-032 | P07 | /[locale]/school/more/grading | PARTIAL | Teacher DE/AR configured class selector and initial gradebook observed on both engines in 46101081057. Root reflow passed; native select height 24/29px on Chromium, new targeted assertion pending. Grade entry, populated and all variants open. |
| WR-033 | P07 | /[locale]/school/more/homework | PARTIAL | German guardian no homework empty state without unauthorized action, Chromium 46083875529 ui-academic-empty:11; teacher/guardian populated and full state variants open. |
| WR-034 | P10 | /[locale]/school/more/invoices | PARTIAL | Actual paid/partial/unpaid, PDF/payer scope iPhone WebKit green; new P10 actual invoice detail and payer permissions verified both engines prior to visual RED (46086031725). Source candidate 961ee5e green all four cases 46089353407; finance tab word fragmentation follow-up and all states remain open. |
| WR-035 | P10 | /[locale]/school/more/issue-invoices | PARTIAL | iPhone WebKit 46083875529 ui-finance-mobile-ux/populated 5/5, Admin DE/AR 320–1280 invoice-type/date/reachable action and actual Arabic manual issue 201 success; auto/missing/error/stale and matched visual matrix open. |
| WR-036 | P08 | /[locale]/school/more/message-reports | OPEN | No specifically verified state recorded in this ledger. |
| WR-037 | P08 | /[locale]/school/more/news | PARTIAL | WebKit 46083875529 ui-communication-chat:323 actual German Admin draft/save/reopen/publish/withdraw from hub link to /more/news, guardian feed only published items; full AR, roles/device and all states/matched screenshots open. |
| WR-038 | P08 | /[locale]/school/more/notifications | PARTIAL | All three roles DE/AR initial authorized notifications route (six per browser) and normal/200% root reflow in 46101081057. Read/unread, deep link, error, actual interactions and full variants open. |
| WR-039 | P07 | /[locale]/school/more/oversight | PARTIAL | Read-only Class Monitor P07 both languages and browsers candidate green, 12 actual images reviewed, 200% section layout correction pending verification. Full academic/device matrix open. |
| WR-040 | P10 | /[locale]/school/more/receipts | PARTIAL | Actual receipts and protected PDFs passed iPhone WebKit 46083875529; fresh finance domain green 46085891983. Full state matrix open. |
| WR-041 | P10 | /[locale]/school/more/record-payment | PARTIAL | iPhone WebKit 46083875529 ui-finance-mobile-ux/populated 5/5, admin DE/AR simple/advanced form, amount retention, review, Arabic validation and real 201 paid/refund domain checks; other scenarios and matched visual matrix open. |
| WR-042 | P07 | /[locale]/school/more/reports | PARTIAL | German guardian reports 390px two native date fields, readable hints and unshifted ISO value, Chromium 46083875529 ui-date-locale:11; report data, export and full visual variants open. |
| WR-043 | P10 | /[locale]/school/more/stop-reviews | OPEN | No specifically verified state recorded in this ledger. |
| WR-044 | P09 | /[locale]/school/more/timetable | PARTIAL | Six role/locale timetable cases per browser on trusted HTTPS passed in 46099859412 (real API lesson times, week navigation, admin editor, no teacher/guardian edit, 200% reflow); initial advertised route also surveyed in 46101081057. Full empty/overlap/keyboard/native matrix open. |
| WR-045 | P05 | /[locale]/school/students/import | PARTIAL | Family import tested in 22-case family suite (46083875529 Chromium); all import error and permission variants/visual review open. |
| WR-046 | P03 | /[locale]/staff/access | PARTIAL | Guardian DE 320 denied 404 in warm P03 diagnostic (46082187416 Chromium); authorized controls/roles/save/error open. |
| WR-047 | P05 | /[locale]/staff/invitations | OPEN | No specifically verified state recorded in this ledger. |
| WR-048 | P03 | /[locale] generic not-found boundary | PARTIAL | RED 46097617645 then GREEN 46098076316, DE/AR 320px normal/200%, light/dark, HTTP 404 and no protected form. Eight new screenshots reviewed; DE 200% word fragmentation remains open; other states/viewports open. |
| WEB-auth/android/callback-route | P03 | /auth/android/callback | OPEN | No specifically verified state recorded in this ledger. |
| WEB-download/android-route | P03 | /download/android | OPEN | No specifically verified state recorded in this ledger. |
| WEB-install-route | P03 | /install | OPEN | No specifically verified state recorded in this ledger. |
| TAB-1 | P04 | /[locale]/school/home | PARTIAL | Admin DE 390, guardian AR 320, teacher DE 390 light/AR 320 dark, teacher-other DE 320 dark/substitute AR 390 light. Real API assignment/lesson comparison and navigation in 46081553330 both browsers; full role/theme/device/fixture and native coverage open. |
| TAB-2 | P05 | /[locale]/school/students | PARTIAL | Family wizard/import and guardian-related UI regression suite 22/22 (46083875529 Chromium); entire element/state matrix and matched visual review open. |
| TAB-3 | P06 | /[locale]/school/attendance | PARTIAL | P06 actual configured attendance tally/row geometry and 200% reflow both browsers; 8 candidate normal/large images reviewed from 46086031725 across Chromium/WebKit, spacing issues identified and candidate fix pending verification. WebKit 46093343149 200% heading Anwesenheit still fragments without valid hyphenation; candidate 15d72a4 adds optional German syllable breaks with unchanged accessible label; local isolated layout RED/GREEN, hosted app verification pending. Full variants open. |
| TAB-4 | P05 | /[locale]/school/children | PARTIAL | Guardian children and family workflows tested in 22-case family suite (46083875529 Chromium); full state matrix open. |
| TAB-5 | P08 | /[locale]/school/messages | PARTIAL | P08 direct chat in both locales across both engines passed on separate runs 46085891935/46086031725; 3 actual chat images reviewed. Real web fixture sign-in/CSRF correction verified 4/4 in 46092801497; repeat full matrix still open; message media, keyboard, role and state matrix open. |
| TAB-6 | P09 | /[locale]/school/calendar | PARTIAL | WebKit 46083875529 ui-communication-chat:158/437, all 3 roles DE/AR 320/390, real calendar requests succeed, correct active tab and month grid, details/back preserve query; full state and matched evidence open. |
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
| AN-001 | P04/P05/P06/P08/P09 | Tabs | PARTIAL | 46097067043 both 320dp and 393dp 24/24 normal + 5/5 200%, title/nav/badge whole-word and glyph bounds, all destinations selected/clickable and 48dp checks passed. 36 shell/home/scope/signed-out screenshots reviewed; DE scope choose/close labels appear Arabic, new localized assertion pending. Live authenticated native/TLS, actual full route content, matched and physical-device matrix open. |
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

- 46097129230 production-mode P03 additional evidence: 5/5 original cases on each browser; independently reviewed 17 images per engine (entry/welcome, install, sign-in, missing-token identity paths, Guardian preferences/profile and generic restricted 404). No valid-token lifecycle or complete role/device/theme matrix. The restricted 404 retains denial but is still default Next English/light; visual follow-up RED test 29c2dcec pending. P06 DE attendance heading break [7] confirmed in both browsers 46096289042; existing other variant gaps remain.

- P12 46097747193 matched production: 420 actions/42 groups at 390x844, baseline b90fab0 and candidate 213ebaff, three roles; pooled median essentially unchanged, Teacher More reused-context outlier, reverse-order repeat and physical-device/paint verification remain open. No scene complete by timing alone.

- P12 reverse production 46098540201 420/420 actions, combined 840/840 in both orders; mixed timing, former teacher More outlier reversed, no consistent broad regression/improvement demonstrated. Physical devices, live API latency/paint and full route matrix remain open.

- Integrated source f86ef0d5: 46099859412 passed 30/30 production targeted cases across both engines (P03, P09 timetable all three roles DE/AR, P10 bank). Route survey 46099859402 covers 112 advertised route visits each engine, initial normal/200% DE-light 390/AR-dark 320 only. Two teacher attendance-review routes denied; readiness 46100377336 found populated staff overflow; later inner calendar and heading tests RED, fixes pending verification. These are partial route/state observations, not complete matched per-element acceptance. 46098872210 native 58/58 incl correct German scope labels both emulator widths. Physical authenticated native, conditional states, remaining widths/themes, matched/manual audit and owner review still open.


## Integrated candidate initial-route comparison — ae13d6ba
[Matched production survey 46101081094](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/46101081094) compared the pinned baseline b90fab0 against ae13d6ba, on the same disposable HTTPS fixtures and each browser. Both completed 112 matched advertised-route rows, with 28 Chromium and 29 WebKit horizontal-overflow rows corrected, zero candidate root overflow, no introduced overflow and no destination/status/denial mismatches. Candidate remains RED because the two teacher attendance-review destinations (DE/AR) are denied by an unchanged baseline guard. Do not waive that failure; see QA-11.
- Matched artifact IDs: Chromium 15245224791, WebKit 15246195543. Single-stage readiness survey 46101081057 artifacts: Chromium 15245074761, WebKit 15245661075. Evidence contains normal and 200% screenshots, route/status and measured geometry, not an independent review of every screenshot.
- Five teacher academic scope selectors are visible but below 44px in the observed normal-size Chromium rendering. New candidate-only survey assertions f2c0f247 test those actual routes at normal/200% text. No scope or state change is claimed until RED/GREEN evidence.
- This is initial advertised-route evidence only (33 distinct route/query templates across three role fixtures). Unadvertised links, restricted capabilities, nested/edit/detail/empty/error/disabled/loading/offline states, all combinations of locale/theme/viewport, native screen matrix, individual element review and physical devices remain open. No scene is marked complete.
