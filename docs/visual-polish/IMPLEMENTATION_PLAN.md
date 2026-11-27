# Madrasty — Whole-App Premium Visual Polish Implementation Plan

> **For agentic workers:** REQUIRED: use superpowers:executing-plans (or subagent-driven-development), test-driven-development, systematic-debugging, verification-before-completion and finishing-a-development-branch. Work phase-by-phase; each checklist is a release gate, not a suggestion.

**Goal:** premium cohesive appearance, smooth feedback and typography across every existing web/PWA and Android screen, with zero functional or workflow changes.

**Architecture:** existing Next.js/React and Compose architecture retained. Semantic visual tokens + reusable components first, platform adaptations second, page-by-page visual pass third, exhaustive evidence and regression gates last. No new backend, database migration or feature. Each phase is a separately reviewable commit/sub-PR if needed, coordinated by one master tracker.

**Tech stack:** existing CSS/Next.js/React/TypeScript, Kotlin Compose Material3, pnpm 11.25.0, Playwright, Android instrumentation, existing synthetic Supabase QA fixtures and GitHub Actions. Baseline `b90fab0bec705b4bf25eb8e43f4f6f8eaa6de77a`.

**Spec:** [Design specification](DESIGN_SPEC.md). **Coverage denominator:** [Inventory](INVENTORY.md). **Progress:** [STATUS](STATUS.md). **New-chat instructions:** [HANDOFF](HANDOFF.md).

## Global rules
Visual polish ONLY. Preserve route/query/back/scroll/state, business rules, API/security/contracts, role gates, data, form meaning, labels, all existing actions and approved finance PDFs. Keep school logo and notebook hero. No production data use in screenshots. No feature removal/addition, no new backend/migrations, no forced iOS redesign of Android. Arabic/German, light/dark and accessibility mandatory. Existing strict motion policy, no blanket CSS overrides or new UI library. Owner approval of P01 prototype and final visual evidence required. A green build is necessary, not sufficient. A visually unchanged screen needs explicit reviewed evidence and rationale; not an automatic PASS. If user asks implementation chat to continue, read exact checkpoint and resume, never restart.

## Review focus (failure modes)
1. Small-screen, long German labels or Arabic names, mixed bidi and 200% text: layout must reflow without cropped controls.
2. Populated vs empty/denied/loading: actual data and terminal state must be verified, no blank/error counted as ready.
3. Floating nav and sheets over keyboard/safe areas, Back and focus: all existing targets accessible and return context unchanged.
4. Dense academic/attendance/finance rows and status semantics: preserve information/actions and exact values; no status relying solely on color.
5. Native/RTL/theme/motion divergence: comparable visual quality on actual platform, no animation/blur performance regression.
6. Accidental workflow drift: before/after actionable controls and request/route semantics identical under the same fixtures.

## Universal per-screen acceptance recipe (apply to EVERY inventory row, even hidden states)
- [ ] Read route wrapper, every imported presentation component, corresponding Compose destination and query/permission predicates; inventory visible/conditional controls with source locations.
- [ ] Capture baseline screenshot + computed style + terminal state under actual authorized fixture; capture negative/empty separately. Save stable ID, source SHA and fixture parameters.
- [ ] Write targeted regression for visual/accessibility defect (e.g. overflow, token use, clipped button, contrast, inaccessible name); observe red if defect exists. Existing visual behavior that already passes needs recorded baseline rather than artificially failing it.
- [ ] Implement presentation changes using approved semantic tokens, minimal component edits; remove stale contradictory styles for that component instead of adding global !important. No mutation handler or route/API/permission changes.
- [ ] Verify same screen/action set, action destination, labels/values/disabled/busy semantics, existing validation/error, keyboard/focus/back/scroll and real API response using synthetic data. Verify UI images side by side, inspect at actual size, not merely screenshot count.
- [ ] Capture matched after evidence for every applicable role, platform, language and theme. Review every text/control/icon in ELEMENTS. Save visual rationale per changed component and mark each scene PASS only if evidence exists; file an exception otherwise.
- [ ] Run focused tests plus related existing behavior suites, commit scoped work with phase/scene IDs. Update STATUS with exact HEAD, commands, results, remaining IDs, known gaps, artifact paths. Never mark phase done with unknown/blocked rows.

## Matrix and evidence
Web/PWA: for every authorized scene at minimum 390px both locales and light/dark; 320 and 430 for all screens as responsive checks, 768/1024/1280 and landscape where layout adapts. iOS WebKit and Chromium Android emulation for mobile, Chromium/Firefox/WebKit for desktop applicable; repeat real device where accessible. Test PWA installed mode/safe-area, browser back, keyboard open, scroll, reduced motion, 200% text, high contrast/opaque fallback. Native: 320/390 dp equivalent compact widths, expanded/tablet/landscape, RTL/LTR, dark/light, fontScale 1.0/1.3/2.0, TalkBack and keyboard. Use supported real device/simulator and record what was actually tested; emulation not physical. Each screen's ready, zero/empty, filtered-empty, long values, disabled, loading, saving, validation, API/network error, retry, forbidden, offline, success and all native dialogs/selection states if applicable; include restricted personas and public. Full matrix may be sharded by phase to keep CI feasible; every required combination must be recorded explicitly, not sampled away. If a state impossible, cite branch/contract and mark NOT_APPLICABLE, never silently skip.

Manifest schema proposed: sceneId, platform, role, capabilityProfile, locale, theme, viewportWidth/height, fontScale, reducedMotion, route, queryTemplate, state, fixtureId, sourceSha, expectedHttpStatus, observedStatus, expectedRoute, finalRoute, terminalState, beforeFiles, afterFiles, elements[], testRunUrl, reviewer, result, rationale. For interactions add video/trace, input latency, target before/after, observed API method/path/status (redact secrets). Evidence path `qa-artifacts/visual-polish/<phase>/<sceneId>/<before|after>/`; preserve summaries and artifacts links, do not commit real PII or enormous binaries. Extend existing screenshot-audit-policy with exact expected identity set and on-disk files; negative tests for missing/duplicate/wrong route/wrong SHA/wrong terminal state. Golden snapshots updated only after visual review.

## Phases (14)
### P00 — Baseline, coverage contract and visual audit
**Outcome:** Freeze current functionality; build scene registry, matched screenshots, element/copy inventory, and trace baselines before changing style.
**Scope:** all source and route IDs with phase owner P00 in INVENTORY; shared components affect downstream but do not close downstream evidence. Every task inherits universal recipe above.
- [ ] Record clean main SHA, open PRs and worktree; branch from latest main after reconciling any changes from baseline. Read prior UI remediation and current feature plans; do not reset existing work.
- [ ] Run tree inventory and route/AST scan including dynamic query/state branches, inline strings and all Android composables, resource XML, HTML offline assets. Expand SCENES/ELEMENTS and review exact routeMeta/capability predicates. Define initial eligible matrix; enumerate exceptions with source proof. No count-only coverage.
- [ ] Seed disposable synthetic school with admin full and limited, teacher assigned/unassigned, guardian zero/one/multiple children, public/expired sessions, populated/empty/error. Reuse fixture API to create data; no production writes. Capture matched before screenshots, at actual device viewport, no developer overlays; include interaction videos/trace and computed styles/font load/contrast, native screenshot semantics.
- [ ] Run existing check:types/build, UI/policy/domain and current motion checks first; store command results, artifacts and baseline failures. Measure 5 repeated cold/warm journeys for each role (route change, dialog, list scroll, payment/attendance only synthetic), input-to-visible-feedback and ready time, long tasks and dropped frames. Record device/browser conditions.
- [ ] Log actionable per-scene visual findings with location and severity (VP0 clipped/unusable, VP1 design inconsistency, VP2 refinement). Do not label unvisited screens as audited. Acceptance: every source and route mapped, no unclassified items, baseline evidence persisted.
**Exit:** review phase diff, test logs, coverage ledger and screenshots; mark phase only with fresh evidence and commit checkpoint.

### P01 — Premium visual language and approval prototype
**Outcome:** Design references translated to Madrasty; tokens, component gallery and interactive HTML/native design samples; obtain one explicit visual approval.
**Scope:** all source and route IDs with phase owner P01 in INVENTORY; shared components affect downstream but do not close downstream evidence. Every task inherits universal recipe above.
- [ ] Produce a visual reference board from written brief, not third-party screenshots in repo; typography samples AR/DE, icons, surfaces, palette candidates, dark/light, density, contrast.
- [ ] Build standalone interactive HTML preview with actual representative screen structure: admin/teacher/parent home, finance list+payment, contact+chat, student/child, attendance, long form, modal, state gallery; include 320/390/430/mobile desktop responsive and RTL. No production writes or API calls. Keep exact existing labels/actions and notebook image. Demonstrate primary/secondary/destructive/icon buttons and pressed/disabled/loading; compare current vs proposed.
- [ ] Include Android Compose component gallery or emulator captures using same tokens with Material3, iOS PWA sample with selective translucency and opaque fallback. Show both role colors and neutral palette; choose only after owner approves.
- [ ] Owner approval gate: present before/after prototypes, explicit palette, type scale, geometry, icon and nav treatment. Save approved screenshots/token decisions in design spec. Do not start broad product code changes before approval. No approval inferred from a green build.
**Exit:** review phase diff, test logs, coverage ledger and screenshots; mark phase only with fresh evidence and commit checkpoint.

### P02 — Foundation, shared components and platform shell
**Outcome:** Implement semantic tokens, button/control/card/list/type/icon primitives, safe-area shell, navigation, settings sheet, status surfaces, reduced motion.
**Scope:** all source and route IDs with phase owner P02 in INVENTORY; shared components affect downstream but do not close downstream evidence. Every task inherits universal recipe above.
- [ ] Extract named tokens into a narrowly scoped stylesheet imported by school.css; maintain compatibility aliases --canvas/--card/--inset/--ink/--muted/--rule/--primary and existing role keys. Avoid CSS cascade piling: consolidate actual repeated declarations, document intentional exceptions.
- [ ] Define shared presentation-only component variants for cards/surfaces, typography, metric, buttons, fields, grouped row, status, segmented control, icon button, sheet/dialog, empty/error/loading; use existing semantics/handlers. Compose counterparts use MaterialTheme Typography, Shapes, ColorScheme; use existing composable signatures or adapters; no route/data changes.
- [ ] Polish SchoolHeader, SchoolShell, MoreBackLink, SchoolLink, settings sheet, ScopeSheet, MoreGroup, AsyncSurface, RecordValues and RoleHero; maintain exact layout behavior, scroll/focus restoration, active state, notification count, safe-area keyboard. Keep notebook + logo.
- [ ] Review all icons/drawables for size/optical alignment/stroke/directional RTL; preserve accessible names and meanings. Platform detection style only; test unsupported blur fallback.
- [ ] Add gallery and token assertions, computed touch area/contrast, focus, reduced motion, safe-area, dark/light, RTL. Run ui-native-foundation, ui-native-controls, ui-header, ui-bottom-nav, ui-scope-sheet, ui-more-back, ui-motion-contract, ui-navigation-pending. Before/after review all shared elements. No new UI library without approval.
**Exit:** review phase diff, test logs, coverage ledger and screenshots; mark phase only with fresh evidence and commit checkpoint.

### P03 — Public entry, identity, security and device states
**Outcome:** Landing, install, sign-in, invitation, recovery/activation, profile, account, sessions, MFA, permission administration and deep-link terminal states.
**Scope:** all source and route IDs with phase owner P03 in INVENTORY; shared components affect downstream but do not close downstream evidence. Every task inherits universal recipe above.
- [ ] Public landing, install/download guidance, sign-in incl password reveal, expired credentials and MFA, invitation activation/recovery/email action. Maintain native input/autofill, validation, redirects, referrer/security metadata and tokens.
- [ ] Account preferences/theme/language/notifications, profile, session controls, security/recovery/MFA, staff access, capability selectors, restricted/denied and resource unavailable states. AR/DE all copy lengths, field label/input/help/error relation, OTP layout, keyboard focus.
- [ ] Android MainActivity/IdentityScreen/SignInScreen, invitation, AccountScreen/ProfileScreen/SecurityScreen/StaffAccessScreen, release gate and native dialogs. Do not change auth/session/permission/intent code. Verify all branches in source, including offline-only/re-auth and sign-out.
- [ ] Tests: admin-mfa, role-pages, ui-language-state, ui-header, ui-terminal-state, ui-long-names, existing identity/policy tests; screenshots for public and capability-restricted cases. Acceptance: no auth flow behavior or security metadata drift.
**Exit:** review phase diff, test logs, coverage ledger and screenshots; mark phase only with fresh evidence and commit checkpoint.

### P04 — Home dashboards, More, work queues
**Outcome:** Admin, teacher, guardian home, notebooks, overview stats, all queue keys, tasks, role-specific cards, more groups, active/limited roles.
**Scope:** all source and route IDs with phase owner P04 in INVENTORY; shared components affect downstream but do not close downstream evidence. Every task inherits universal recipe above.
- [ ] Home of admin: keep notebook hero, counts and capability gating; polish greeting, date, prominent hierarchy, KPI tiles, actual finance/attendance summaries, actions, no invented metrics. Teacher: today's class/tasks, attendance and existing shortcuts. Guardian: own children, upcoming items and notifications, existing shortcuts. Every no-data/setup-required state.
- [ ] More: same group order, label, rows, disclosure behavior, account controls and role filters. Distinguish section/row/chevron, focus and expand motion. No hidden or moved links.
- [ ] WorkQueues/tasks: all seven keys, list/empty/unavailable counts, date scope, actual target destination, pagination. Use readable numbers, subtle urgency statuses, no fake zero for unavailable. Keep all links.
- [ ] Android SchoolHomeScreen and native WorkspacePage.Tabs, AdminTasks and Queue. Tests ui-admin-start-redesign, ui-work-queues-ready, ui-more-disclosure, ui-acceptance-matrix, ui-guardian-children, role-pages. Acceptance: matched role data and destinations unchanged; screen review separately for each role and limited permission.
**Exit:** review phase diff, test logs, coverage ledger and screenshots; mark phase only with fresh evidence and commit checkpoint.

### P05 — Students, families, staff and school setup
**Outcome:** All family/student/guardian variants, import, placement, classes, assignments, staff invitations/provision, contacts where related, school year configuration.
**Scope:** all source and route IDs with phase owner P05 in INVENTORY; shared components affect downstream but do not close downstream evidence. Every task inherits universal recipe above.
- [ ] Students: every family list/filter/search/selected pupil/guardian/link branch, add child/guardian forms, group membership, detail and all role/capability-controlled links. Polish row/avatar/long name/status, clear secondary metadata, no action relocation.
- [ ] Family wizard/group/people/import: each step, selection, errors, empty, upload/progress, previews, validation, completion, invite status. Preserve form steps, data, template files, import parser and job states.
- [ ] Classes/enrollments: list, details, placement, class settings, assignment, status, date, existing save/confirm; teachers/admin staff workspace, direct staff provisioning, invitations list/detail/batch/resend and access. Keep all field meanings and rights.
- [ ] Guardian Children screen: zero/one/multiple, selected child, full child overview and detail, links to attendance, academic, timetable, invoices, stop. Privacy and data scoping untouched.
- [ ] Native FamiliesScreen, FamilyGroupScreen, FamilyWizard, EnrollmentScreen, ImportScreen, StaffAssignmentsScreen, InvitationScreens. Tests ui-family-management, ui-guided-workflows, ui-guardian-children, ui-fixture-names, ui-long-names, FamilyVisualTest. Acceptance: all nested steps/screens and real actions still present; import/permission regression.
**Exit:** review phase diff, test logs, coverage ledger and screenshots; mark phase only with fresh evidence and commit checkpoint.

### P06 — Attendance and offline
**Outcome:** Teacher daily sheet, row details, approvals, history, guardian attendance and excuses, offline vault and sync states.
**Scope:** all source and route IDs with phase owner P06 in INVENTORY; shared components affect downstream but do not close downstream evidence. Every task inherits universal recipe above.
- [ ] Teacher daily attendance: date/class picker, sheet heading/counts, student rows, existing present/late/absent controls, badges, note/details, drafts, saved/submitted/approved status, offline sync, retry. Distinguish state by icon/text not color only. Avoid large cards for every pupil; dense rows must remain easy to scan and tap.
- [ ] Admin supervisor review/history, guardian child attendance/excuse: all filters and detail rows, existing status, request/approval controls, errors and empty. No changing attendance criteria, publication or approval.
- [ ] Offline web HTML/CSS and Android OfflineAttendanceScreen, vault locked/unlocked, disconnected/reconnect, queued/failed sync, conflict. No network/storage/crypto code changes. Keep real read/write tests.
- [ ] Tests ui-attendance-ready, attendance-offline, ui-date-locale, role-pages, existing attendance QA; baseline unconfigured-calendar 503 separate from READY. Acceptance: configured synthetic school truly READY and offline/return-to-online functionality verified.
**Exit:** review phase diff, test logs, coverage ledger and screenshots; mark phase only with fresh evidence and commit checkpoint.

### P07 — Academics and class oversight
**Outcome:** Curriculum, activities, homework, grading, exams, evaluation, academic report and admin class monitor (published-only access).
**Scope:** all source and route IDs with phase owner P07 in INVENTORY; shared components affect downstream but do not close downstream evidence. Every task inherits universal recipe above.
- [ ] Curriculum/subjects/lesson lists, detail/editor, class/pupil selectors, teaching activity lists/compose/publish; existing title/body dates, attachment status, action hierarchy. No change draft/publication semantics.
- [ ] Homework all states, assignment detail, submissions, marking/feedback; gradebook table/numeric inputs; exams/marks, evaluation/rubric, score status. Keep dense tables and data exact, no decorative invented progress. Handle long names, mixed Arabic/DE, decimals, missing marks, selected class.
- [ ] AcademicReport list/detail/sections/source links, admin ClassMonitor/TeachingOverview class list/detail, published-only grades/evaluations and attendance. Capture both authorized and restricted roles without leaking draft info.
- [ ] Native AcademicReportScreen, ReportBody, ActivityWork, AssessmentScope, CurriculumScreen, EvaluationScreen, ExamMarksScreen, ExamScreen, GradebookScreen, HomeworkScreen, TeachingActivityScreen. Tests ui-academic-empty, ui-admin-oversight, ui-guided-workflows, qa:academics. Acceptance: all published/draft/read-only/edit states preserved.
**Exit:** review phase diff, test logs, coverage ledger and screenshots; mark phase only with fresh evidence and commit checkpoint.

### P08 — Communication, contacts and media
**Outcome:** Chat list, contact directory, conversation, composer, voice, attachments, notifications, publishing, broadcast, moderation.
**Scope:** all source and route IDs with phase owner P08 in INVENTORY; shared components affect downstream but do not close downstream evidence. Every task inherits universal recipe above.
- [ ] Kontakt/chat hub and feed, inbox search/filter tabs, unread count, avatars, status, empty and pagination; contact directory and start conversation including blocked/no permission. Preserve tab and composer behavior.
- [ ] Thread header, details sheet, message bubbles incl timestamps, delivery state, unread/day separators, reactions, incoming/outgoing, long text, RTL, media, reply/selection and existing action menus. Match references' softness without turning chat into stacked cards. Preserve WhatsApp-like microphone placement and existing draft behavior.
- [ ] Composer, microphone, recording/preview/cancel/send, waveform/playback, attachment sheet, camera/gallery/files, upload progress/failure/retry, permissions, keyboard/safe-area, image viewer and media gallery. Keep native permissions and file/media transport; no audio or delivery change.
- [ ] Feed/news/events links, broadcast composer/recipient selection, notification center/settings/deep link, report queue/moderation. Polish every existing card/list, status and modal; no access change.
- [ ] Native BroadcastComposer, CommunicationFeed, Conversation, MediaCapture/MediaComposer/MediaTransfer, NotificationCenter, ReportQueue, SchoolPublishing, StartConversation, ThreadInbox, VoiceWaveform and existing permission overlays. Tests ui-communication-chat, ui-communication-visual-audit, ui-thread-inbox, ui-navigation-pending, CommunicationVisualTest, qa:communication; include failed upload and keyboard. Acceptance: exact chat state/route/mic semantics preserved.
**Exit:** review phase diff, test logs, coverage ledger and screenshots; mark phase only with fresh evidence and commit checkpoint.

### P09 — Calendar and timetable
**Outcome:** Calendar tab/events, school calendar, timetable view/editor, class/date selectors, agenda and event details.
**Scope:** all source and route IDs with phase owner P09 in INVENTORY; shared components affect downstream but do not close downstream evidence. Every task inherits universal recipe above.
- [ ] Calendar tab (separate from Kontakt), event list/detail/editor/agenda, selected day and markers, month navigation, week/day headers, today/selected/teaching/nonteaching distinction. Keep dates/timezone/selection/query routing. No color-only meaning.
- [ ] School calendar/year config: start/end, holiday, teaching date, editor validation and save. Weekly timetable: admin/teacher/guardian view, class selection, week/day, session cards, editor, empty/overlap state; no change scheduling or validation.
- [ ] Native CalendarScreen, TimetableScreen, TimetableEditor, SchoolPublicationScreen Events. Tests ui-calendar-preview, ui-date-locale, ui-desktop-layout, relevant school QA. Verify mobile grid and long text without compressed inaccessible hit targets.
**Exit:** review phase diff, test logs, coverage ledger and screenshots; mark phase only with fresh evidence and commit checkpoint.

### P10 — Finance — every admin and guardian state
**Outcome:** Overview, invoices, issue/payer, payments, receipts, journal, settings, bank, corrections, refunds, participation pause and exceptional reviews. Preserve V2 logic and approved PDFs.
**Scope:** all source and route IDs with phase owner P10 in INVENTORY; shared components affect downstream but do not close downstream evidence. Every task inherits universal recipe above.
- [ ] Overview / reports / Meine Zahlungen: strong balance typography, truthful current vs selected-month totals, progress/chart labels, filters and export links. Keep actual currency/date/math, no color-only status.
- [ ] Rechnungen list/search/filter, selected invoice details, parent view, PDF link, quick payment, cancel/reissue. Preserve all V2 routes, query context, existing permission gates, no changes to approved invoice PDF renderer.
- [ ] IssueInvoices single pupil/class/school and monthly/manual, picker, date, fee lines, inline payer repair, readiness/blockers, totals, primary action, successful result, retry. Improve styling only; retain backend preview protocol and exact submission logic.
- [ ] Simple/advanced RecordPayment, cash/bank, full/partial/overpay rules, same-payer scope, date/reference, field errors/stale/loading, returned receipt and navigation. Keep Barzahlung default and confirmed transaction semantics. No reintroducing preview steps or moving buttons.
- [ ] ReceiptDetails, linked allocations, unapply/void, actual refund and evidence, Kasse & Bank ledger/history/filter, movement/correction forms, transfer direction, PDF/CSV current limits and messages. Distinguish physical refund vs correction visually, not via logic changes.
- [ ] FeeSettings, automatic billing, bank/MFA and transfer data, next-month participation pause guardian/admin list/detail and exceptional StopReview. Do not change pause duration, pricing, allocation, approval, validation, balance, refund or history.
- [ ] All native finance files in inventory; preserve UI/permission differences currently implemented and document behavior parity gaps separately. Tests ui-finance-mobile-ux, ui-finance-populated, FinanceVisualTest, qa:finance, contracts, PDF tests unchanged. Acceptance: every finance route/state captured and business totals/receipt IDs unchanged on synthetic fixtures.
**Exit:** review phase diff, test logs, coverage ledger and screenshots; mark phase only with fresh evidence and commit checkpoint.

### P11 — Cross-cutting typography, copy, accessibility and system polish
**Outcome:** Sweep every visible string, icon, avatar, input, dialog, dense data and state in the registry; verify contrast, zoom, keyboard, screen reader and RTL.
**Scope:** all source and route IDs with phase owner P11 in INVENTORY; shared components affect downstream but do not close downstream evidence. Every task inherits universal recipe above.
- [ ] Run ELEMENTS completeness scan against all JSX/composable conditional branches and every translation file. Inspect each visible text node incl bidi/diacritics/numeric strings, labels, placeholders, tooltip, status, help, button, icon-only accessible name, warning, confirmations, loading and error. Use easy German/Arabic with meaning unchanged. Record before/after string diffs for any corrections, owner review wording changes.
- [ ] Review each component variant by states: normal, focus, hover if pointer, pressed, disabled, busy, selected, invalid, read-only, empty, error/forbidden/offline/success. Check contrast and focus visibility, no overlapping tap area or clipping, 200% browser zoom, Android fontScale, portrait/landscape/tablet/desktop, long names. Test AR RTL and DE LTR; do not mirror non-directional icons.
- [ ] Review all accessibility tree headings/names/labels/role/status announcements, keyboard tab order, native TalkBack and VoiceOver if device accessible. Reduced-motion/opaque fallback. Flag physical device unavailable honestly. No claims of WCAG certification.
- [ ] Re-run source registry diff. Any overlooked scene or element blocks completion. Review install assets and offline layout with original notebook/school seal. Document purely nonvisual files as inspected unchanged.
**Exit:** review phase diff, test logs, coverage ledger and screenshots; mark phase only with fresh evidence and commit checkpoint.

### P12 — Whole-app motion and real performance
**Outcome:** Matched trace and interaction verification on every critical journey; fix presentation regressions only, no arbitrary delays or fake loading.
**Scope:** all source and route IDs with phase owner P12 in INVENTORY; shared components affect downstream but do not close downstream evidence. Every task inherits universal recipe above.
- [ ] Record matched traces baseline vs candidate on same fixture/device/settings. Cover route taps, scrolling list/chat, sheet open/close, button press, keyboard, selects, heavy tables, loading/skeleton. 5+ repetitions per critical journey, report median and p95 where sample size adequate; no invented metrics.
- [ ] Verify first paint response to press target <100ms on tested device, no deliberate animation delay, aim 60Hz frame budget ~16.7ms on representative device; report actual frame/long task distribution. No material regression against baseline, investigate any repeated >50ms main-thread task attributable to styling, no new forced layout or oversized layer churn. Hardware evidence separate from emulation.
- [ ] Preserve existing motion spec: no transition:all, no repeated entrances, scoped effects and reduced motion. Update tests only to pin explicitly approved new presentation behavior, never to loosen failure checks. Measure bundle/style cost and memory, avoid dependencies or excess backdrop filters.
- [ ] Re-run ui-performance, ui-motion-contract, ui-navigation-pending, ui-bottom-nav. If baseline CI navigation flake appears, debug trace, do not mask by larger timeout. Acceptance: before/after data, videos and no unresolved presentation regression.
**Exit:** review phase diff, test logs, coverage ledger and screenshots; mark phase only with fresh evidence and commit checkpoint.

### P13 — Final visual acceptance and release
**Outcome:** Exact scene/element coverage gate, native parity, all applicable CI jobs green, independent review, owner acceptance, squash merge and production verification.
**Scope:** all source and route IDs with phase owner P13 in INVENTORY; shared components affect downstream but do not close downstream evidence. Every task inherits universal recipe above.
- [ ] Reconcile final git tree vs SCENES/ELEMENTS; all applicable route/state/role/locale/platform rows done with matched evidence. No missing/duplicate IDs, no error/denied counted as READY, no screenshots of real school data. Review at 320/390/430 and desktop; both themes/languages, keyboard/RTL, accessibility settings and platform variants. Independent visual review each screen against approved prototype. Do not claim physical-device tests if unavailable.
- [ ] Run full applicable UI + native build/instrumentation, typecheck/web build, school/attendance/academic/comms/finance/policy/contracts and performance regressions; use existing workflows, ensure branch triggers correct jobs. If whole qa:all needs unavailable infrastructure, report exact unmet gate instead of skipping silently. Keep test assertions and baseline fixtures trustworthy. Review diff for no backend/API/migration, no workflow changes, no hidden actions or altered strings.
- [ ] Wait for exact current HEAD CI completion. Poll every 12 seconds while active; on failure inspect logs/artifact, reproduce, fix source/test defect (never weaken checks), rerun, verify actual green. Do not say finished merely because CI started. If tool limits, persist exact checkpoint and report blocker, don't claim background monitoring.
- [ ] Owner signoff on final visual comparison and documented exceptions, independent code review. Only then mark implementation PR ready, verify main/HEAD and all required jobs, squash merge, verify merged main SHA, Vercel production READY exact SHA, smoke test read-only UI + synthetic/test environment actions. Native APK build/emulator distinct from physical install. No migration needed. Archive evidence and final status; release only if all required gates met.
**Exit:** review phase diff, test logs, coverage ledger and screenshots; mark phase only with fresh evidence and commit checkpoint.

## Execution / review commands
Start with exact current versions in package.json and existing workflows; use disposable stack. Known repo commands: `pnpm install --frozen-lockfile`, `pnpm check:types`, `pnpm build:web`, `pnpm build:android`, `node --test qa/screenshot-audit-policy.test.mjs`, `node --test qa/qa-overlay-policy.test.mjs`, `pwsh -NoProfile -File qa/start-stack.ps1`, `pwsh -NoProfile -File qa/local.ps1 -Serve`, `pnpm exec playwright test --config qa/ui-remediation.config.ts`, `pnpm qa:contracts`, `pnpm qa:school`, `pnpm qa:policy`, `pnpm qa:academics`, `pnpm qa:communication`, `pnpm qa:finance`, `pnpm qa:android`, `pnpm qa:all` where prerequisites available. Use actual CI job commands and focused configs (see INVENTORY). Do not launch parallel local stacks sharing ports. Check actual run conclusions on exact HEAD, not previous successful commits. Do not modify business tests to suit new appearance; adapt selectors only where visual DOM legitimately changes, retaining original behavioral assertions. Separate visual test failures from runner setup failures and fix/retry accordingly.

## Release stop conditions
Any unclassified page/component/label/icon/state, workflow/data/permission change, clipping/contrast/RTL regression, unexplained screenshot mismatch, unreviewed new design, missing required CI evidence, unresolved visual/performance regression, or failed test blocks release. Explicit owner decision needed for any scope change or device-evidence waiver; report limitations instead of misrepresenting. No final "done" before actual verified merge/deploy. Implementation branch chosen after current main check; docs branch is not production code.

## Deliverables
Approved spec and design prototype; token/component gallery; source inventory expanded to SCENES/ELEMENTS; baseline and after screenshots/videos/trace; issue ledger with exact before/after rationale; Web and Compose commits, full coverage report and CI logs; final owner review and release verification. All tracked in GitHub; keep status up to date to support context-window handoffs.