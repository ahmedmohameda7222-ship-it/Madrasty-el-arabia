# Visual Polish — durable checkpoint

Updated 2026-11-27. Local branch `visual-polish/premium`. Product baseline `b90fab0bec705b4bf25eb8e43f4f6f8eaa6de77a`. Planning commit `1b015542e5ccec579b6e3f097b3246ba15ae97e7`. P02 presentation candidate `101a4e1594218e55f821ef6066ed198b25452dbb` plus native QA `191ef2e`. Current P03 identity candidate `7221bd00b43a1bb8a89b21141307df17636553ba`. Current P04 presentation candidate `f5a1cdaba08c3caea6e870f5e48f9b079b04c74a`. Product changes are presentation-only.

## GitHub baseline

Fetched GitHub main at `b90fab0b`, the same product tree used in the planning commit. Finance V2 (#31) and bilingual invoice PDF (#32) are on main. Open PRs at preflight were [#23](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/pull/23) for locale and workspace state and [#15](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/pull/15) for the earlier accounting workspace. Kept both outside the local branch. The original `perf/school-navigation` checkout and its existing generated file were left in place.

## Phase tracker

| Phase | State | Evidence |
| --- | --- | --- |
| P00 Baseline, coverage contract and visual audit | IN PROGRESS | 129 scene entries with route and native source references, 545 files and 35,477 element candidates. The manual state, locale, capability and platform matrix and timed baselines remain open. |
| P01 Premium visual language and approval prototype | BYPASSED PER OWNER | Owner explicitly requested direct P02 work. Forest and warm neutral palette, role-specific hero colors, high-emphasis capsules, and translucent iOS-style navigation were selected from the saved spec. |
| P02 Foundation, shared components and platform shell | IN PROGRESS | Candidate committed locally. Focused browser interaction tests, web/Android builds, and matched native instrumentation passed. Full web regression and the wider matrix are still open. |
| P03 Public entry, identity, security and device states | IN PROGRESS | Welcome, sign-in and install polished in `51c10fa`. Two mobile cases passed each in Chromium and WebKit. Public identity states, settings/profile access and native sign-in were polished in `7221bd0`. Authenticated security, valid invitation and advanced device-state matrices remain open. |
| P04 Home dashboards, More, work queues | IN PROGRESS | Larger Admin metrics with 200% reflow, compact Guardian scope picker, and softer queue rows. The two role checks and all seven queue URLs passed at the recorded German and Arabic phone widths. |
| P05 Students, families, staff and school setup | NOT STARTED | Pending. |
| P06 Attendance and offline | NOT STARTED | Pending. |
| P07 Academics and class oversight | NOT STARTED | Pending. |
| P08 Communication, contacts and media | NOT STARTED | Pending. |
| P09 Calendar and timetable | NOT STARTED | Pending. |
| P10 Finance | NOT STARTED | Opened the invoices list through the existing Arabic admin menu in the live preview. |
| P11 Typography, copy, accessibility and system polish | NOT STARTED | Pending. |
| P12 Motion and real performance | NOT STARTED | Existing motion tests passed. Comparative end-to-end performance traces and timing remain open. |
| P13 Visual acceptance and release | NOT STARTED | Pending. |

## P00 registry and evidence

- [SCENES.json](SCENES.json) lists web route definitions, all seven tab expansions, queue keys, resource kinds, wrappers, platform endpoints, the offline surface, and named native destinations. Route entries carry query declarations, guard expressions and linked local presentation sources.
- [ELEMENTS.json](ELEMENTS.json) indexes TypeScript JSX, inline strings, attribute and branch expressions, Kotlin composables and call sites, resource markup, and translations. These are discovery candidates. Inherited accessibility semantics, effective permissions, repeated data, and actual visibility require manual and runtime checks.
- Run `node qa/fixtures/visual-polish-registry.mjs --check` from the repository root. Each registry records the pinned product baseline and a fingerprint of the scoped source files.
- Local evidence is under `qa-artifacts/visual-polish/P02/`. The matching Chromium files cover Admin German light at 390 px, Teacher German light at 1280 px, and Guardian Arabic dark at 320 px. Each includes home, settings and More screenshots, route and computed-style metadata, and interaction traces. The earliest baseline PNGs include Next's development indicator. The live preview and later evidence use `QA_SCREENSHOTS_ONLY=1` with the repository's QA server.
- P00 still needs exact scene variants for each applicable fixture, permissions and terminal state, five repeat traces for cold and warm role journeys, and the complete device and viewport matrix. Screen IDs without recorded evidence remain open.

## Local P02 checks

| Command or check | Result |
| --- | --- |
| `pnpm check:types`, `pnpm build:web` | Exit 0 on the candidate web source. |
| `node --test qa/screenshot-audit-policy.test.mjs qa/qa-overlay-policy.test.mjs` | 15 passed. |
| `pnpm exec playwright test --config qa/ui-remediation.config.ts ui-native-foundation ui-native-controls ui-header ui-bottom-nav ui-scope-sheet ui-more-back ui-motion-contract` | 11 passed in Chromium. |
| `pnpm exec playwright test --config qa/visual-polish.config.ts` | RED on unchanged Admin hero geometry (24 px against 28 px minimum). Three cases passed after P02, including UI navigation, settings focus, More disclosure, theme and RTL, and the opaque accessibility fallback. |
| `pnpm exec playwright test --config qa/visual-polish.config.ts --browser webkit` | Three cases passed. Windows Playwright WebKit with emulated viewport and UA. |
| `pnpm qa:android` | Two Android package/link policy tests passed. Kotlin unit tests, debug APK and instrumentation APK build passed after the P02 presentation changes. |
| `:app:assembleDebug :app:assembleDebugAndroidTest` | Candidate and native instrumented test compiled in the local SDK. |
| Live laptop QA | Edge at 390 px DE and 320 px AR. Opened settings, changed presentation language, returned focus on close, expanded accounting and followed its invoice link. Restored German and left the signed-in synthetic Admin preview open on home. |
| Full Chromium UI remediation suite | 51 passed and 10 failed on the reused synthetic stack. Eight calendar-fixture writes returned 409 stale revision. Two Teacher cases expected a 503 but the configured stack rendered an empty attendance day. See functional and QA findings. |
| Android emulator | API 35, 1080×2340 at 440 dpi (approximately 393dp). P02 scope selection, navigation and hero action passed 2/2 on baseline in capture mode. Candidate assertions failed on the unmodified 40dp button, then passed 2/2 with the 48dp candidate. Full native suite passed 21/21 at this checkpoint. Matched native evidence in `qa-artifacts/visual-polish/P02/android-emulator/` with before, RED and after logs. |

## P03 public entry checks

- German light at 390 px and Arabic dark at 320 px passed in Chromium and WebKit. Verified exact sign-in and install navigation, autofill attributes, LTR credential values and password reveal/remask. The welcome rectangle failed the new visual assertion on the baseline and met the radius requirement after the change. Matched Chromium screens in `qa-artifacts/visual-polish/P03/`.
- Live Edge at 390 px showed the welcome panel, iOS installation guidance, Android APK unavailable state and sign-in form. The signed-in Admin preview is still running separately.
- Invitation without a token, recovery request form, and email/activation without a token passed in both languages in Chromium. The real 320 px Guardian settings/profile interaction and staff-access 404 passed. The Android signed-out activity test observed the previous 40dp primary button and passed after the 48dp change. The complete local Android suite passed 22/22 on the API 35 emulator. Authenticated MFA editing, valid/expired links, capabilities, Android settings and profile, and the broader device matrix remain open.

## Findings and decisions

- The local disposable QA stack was missing later baseline migrations and held a failed synthetic run. Applied the checked-in migrations to that existing loopback fixture stack and generated fresh QA bindings. Restarted the development server with the fresh allowlist. Application database files and production environments were outside this operation.
- Desktop remains opaque and Compose uses Material 3. iOS-style web navigation uses a single backdrop effect at phone widths and falls back to an opaque bar for unsupported blur, increased contrast and reduced transparency. Chromium verified both the translucent and fallback styles.
- The live 390 px Windows report showed a large default scrollbar inside the content pane. Scoped a thin scrollbar to the compact shell while retaining visible scrolling. At 320 px Arabic dark, the guardian scope card still has disproportionate padding around a single button. That card's page-specific density belongs to P04.
- The first settings tap immediately after a cold Next dev reload was ignored once before hydration. It worked after the page became interactive. Retest a production build during P12 before classifying it as a product defect. No handler changes were made.
- The design follows [Apple HIG materials](https://developer.apple.com/design/human-interface-guidelines/materials), [Android Compose Material 3](https://developer.android.com/develop/ui/compose/designsystems/material3), and [WCAG 2.2](https://www.w3.org/TR/WCAG22/). No physical-phone verification has taken place.

## Resume

Reconcile P00 matrix and fixture follow-ups. Verify remaining P03 variants. Resume P04 with Teacher and native dashboards, all role/capability variants of More, and Arabic/dark/negative/paginated queue cases. Continue P05 through P13 in order once those checks are resolved. The active local preview remains at http://127.0.0.1:4300. See [functional and QA findings](FUNCTIONAL_FINDINGS.md) for failure classification. GitHub and CI release work follow local review. The owner’s 5% usage checkpoint was reached. Prepare the dedicated GitHub branch for handoff. The release remains pending final local and CI checks and approval.


## P04 verification and open items

- The new phone tests failed on the original 27.2 px Admin count and 24 px Guardian picker padding, then passed after the visual changes. The candidate preserves the existing task destination and returns focus after selecting the current child. At 200% type, the Admin metric grid stayed within its own width.
- Chromium rendered all seven queue URLs at 390 px German using actual API responses and verified each displayed row count and the existing date-preserving back link. These captures represent the observed populated or empty cases. Local evidence is in `qa-artifacts/visual-polish/P04/`.
- Live Edge at 390 px verified Admin home, the task overview, the populated class-assignment queue, and keyboard navigation to the original assignments destination. The live preview was restarted on the same port after Next.js automatically restarted its worker at the memory threshold.
- The last combined Chromium run passed 9/11, including the three P04 tests. German install navigation and guardian profile navigation were intermittent under the dev server in that run. The component tests for entry and identity had passed individually in Chromium and WebKit. Keep the aggregate pending and investigate it on a stable server. No original test assertions were changed.
- Android 22/22 instrumentation evidence is for the latest native source in `7221bd0`. P04 changes only web presentation. All 15 screenshot/overlay policy checks passed, and the diff has no changes under contracts, Supabase, server/API implementation, or Finance V2 presentation/PDF.

## P04 remote continuation — test preparation (2026-11-27)

- Base remote HEAD `4574cb26a6c70b4b3be946550ac9d6268314b5e9`. Owner authorized continuing from GitHub without the prior Windows workflow. Added `qa/web/ui-visual-polish-p04-remaining.spec.ts` with four teacher-home cases, eighteen role/locale More cases and seven Arabic queue cases. These use the existing restricted loopback fixture bindings and actual browser API responses, not fabricated production data. Per-case traces/screenshots and observed-state metadata are written only during execution. Pagination is recorded only if a real cursor is available. The file is matched by the existing visual-polish Playwright config.
- **NOT RUN / NOT AUDITED:** GitHub source access is available but the execution sandbox cannot resolve github.com, has no repository checkout or pnpm, and cannot access the Windows fixture stack or AVD. No RED/GREEN result, new screenshot, trace or coverage completion is claimed. No product code or existing assertion changed. The 5% Codex usage counter is not exposed here.
- Next: run the added spec on the disposable local stack (both Chromium and WebKit), inspect the actual captured states against the design, resolve any failures without weakening assertions, and make narrowly scoped visual changes with RED/GREEN evidence. Still open: real paginated fixture if no cursor observed, restricted queue errors, capability-specific expected full route inventory, native dashboards, additional viewports, P00/P03 and P05–P13. Do not start release CI or merge before the required approvals and gates.

## P00 cross-platform registry verification — isolated development runner

- Development-only workflow `.github/workflows/visual-polish-development.yml` uses loopback synthetic Auth/PostgreSQL and the existing QA scripts, never production data or deployment. Initial run [46079621892](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/46079621892) passed 35/35 policy/finance-structure tests; registry check failed on cross-platform fingerprints before build/type checks. Browser jobs continued independently.
- Read-only diagnostics [46079740811](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/46079740811) found only the fingerprint line differed in both regenerated registries. Diagnostic [46079817325](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/46079817325) reproduced the exact Windows fingerprint by converting `manifest.webmanifest` to CRLF, and showed the corrected text normalization yields byte-identical registries for LF and CRLF manifest/CSV content. Binary resources remain byte-exact. Isolated regeneration [46079959793](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/46079959793) generated and verified both documents, pushed commit `640d06b4a92d364752b906e8b9a8d65bd9ab8a26` (verified remote), and produced source fingerprint `d88fcba9f90a020609c0982d455b84ef36a3f02722068d54bc1ad7a5b45f50da`. This is a QA tooling correction, not audited scene coverage or product functionality.
- The one-shot registry regeneration and diagnostic workflows are removed after the correction; permanent development QA is read-only. Added a normalization unit test and retained the strict generated-registry equality gate. Pending fresh exact-HEAD CI. The earlier browser run must not be cancelled merely to start this correction. No new product source or existing assertions modified.

## Development runtime continuation

- Run 46079621892: all 29 new P04 cases passed in each of Chromium and WebKit. Combined results: Chromium 39/40; WebKit 38/40. Failures are in existing P03 navigation cases and recorded as QA-03, not waived. Static run 46080077836 passed all steps, including registry equality, new normalization tests, TypeScript and build.
- Added `qa/local.ps1 -Serve -Production` for the current isolated checkout only. It retains all existing endpoint/database guards and does not change application handlers or previous-release serving. Development browser CI now builds the production candidate before starting it to diagnose QA-03. No deployment or release CI.

## Development runtime checkpoint — 2026-11-28 (CET)

- Run [46080379411](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/46080379411): static checks/build green; both production-mode browser jobs stopped before UI tests with local fixture session HTTP 500. Production uses verified database TLS and __Host- secure session cookies, unlike the established loopback QA stack. Reverted the development runner to the supported dev server, retaining production build checks and security behavior unchanged. P03 production navigation remains unverified. Added two P04 hierarchy tests; RED not yet observed because the production fixture bootstrap failed.
- Native [46080077890](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/46080077890): both API35 emulator sizes compiled and ran 22 instrumentation cases, 21 passed each. SignInVisualTest failed the displayed disabled primary action assertion on both sizes. The actual screen temporarily labels this control as loading during asynchronous restore. Added bounded condition-based waiting for the original disabled sign-in node; existing visibility, disabled-state and height assertions remain intact. This is a diagnostic test synchronization correction, not a confirmed product fix. Re-run both native jobs and inspect outcomes.
- No production authentication, cookie, TLS or domain logic changes. Actual screenshots/traces remain in the isolated runner only; visual approval and device review are outstanding.

## P04 measured hierarchy RED and CSS candidate

- Chromium run 46081000116 at `d0eac8b`: 39/42 passed. Both new hierarchy cases reached the real pages and reproduced 44px primary CTA, 14px radius, flex assignment rows, weight 400, and equal 17px More section/row typography. Failed the required 48px assertion in both locales. The old German install navigation failure remains open. Static/build passed.
- Product CSS commit `d1767e3540775090ea941e0bb748655c54d2f777` from [46081462516](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/46081462516) addresses those measured findings: 48px pill schedule action, stacked assignment title/metadata with directional chevron, legible time/subject hierarchy, 18px More summary and wrapping. The synchronization job regenerated and verified both discovery registries and allowed only school.css and the two generated files in its commit. Its temporary write workflow is removed. No route, label, action, backend or auth behavior changes.
- Two P05 staff workspace geometry tests were added in `84c32ae`, no staff source changes yet. They cover real admin directory and direct-provision open/cancel, token colors, touch sizes and Arabic tracking. Pending baseline run. All P04/P05 visual review and broader phase coverage remain open until observed and approved. No final release CI or merge.

## P05 measured staff RED and candidate; P06 preparation

- Native rerun [46081000121](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/46081000121) passed all 22 instrumentation cases on each of the 320dp and 393dp API35 configurations, after bounded synchronization on the settled sign-in state. The original sign-in assertions are retained; this does not establish full native screen coverage.
- Both browsers in [46081249071](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/46081249071) reproduced P05 staff baseline: header cancel 38px, primary corner 12px, card corner 19px, hard-coded teal instead of the shared light/dark action palette, Arabic tracking -0.6px. Real directory and provisioning open/cancel were exercised. Chromium 39/44 and WebKit 38/44 (expected RED cases and known P03 failures). WebKit also reproduced P04 hierarchy RED.
- Source candidate `f7159f2e8f50826692726b512b06c7c63ad2d4f7` from [46082052854](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/46082052854) updates only StaffWorkspace.module.css to the shared tokens, 44px secondary target, 48px primary/control minima, pill primary and 22px card, untracked Arabic titles, field borders/focus, wrapping and disclosure hit area. Registries regenerated and verified. Temporary write workflow removed. Pending fresh candidate browser verification, all other P05 scenes remain open.
- Added P06 configured attendance geometry test (actual loopback classroom/sheet, tally values, row/selector geometry, both locales, 200% reflow). This is preparatory, not an attendance/offline audit. No attendance product code changed yet. P00/P03 and broader device/visual evidence remain open. No release CI, PR or merge.

## P06 measured RED and attendance candidate; P07 class monitor preparation

- P04 candidate [46081553330](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/46081553330): both browsers passed the two new hierarchy checks, with 48px primary CTA, 999px radius, grid rows, 650 title weight and 18px/17px More hierarchy. Existing P03 cold navigation cases remained red; P05 was still baseline in that run.
- Combined Chromium run [46082187416](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/46082187416): 43/46 passed, including P04 and both P05 staff candidate cases. Actual P05 cancel 44px, primary 999px radius, card 22px, token colors match and Arabic tracking normal. All five P03 routes passed the diagnostic warm rerun; the original cold-navigation failure remains unresolved and is not waived. WebKit failed at disposable stack startup (resource or port conflict), no candidate test results. Static/type/build green.
- P06 RED in Chromium: German 200% reflow overflow 141px; Arabic tally 17px/400, rows no inset, selector 44px. Candidate `625c91a51ecb66ce9f77074ccc70520eac461d38` adds scoped attendance presentation classes, intrinsic sizing, wrapping, 22px/700 tally, 12px row inset, 48px native fields, and matching standalone offline CSS palette. [46083556516](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/46083556516) regenerated and verified both discovery registries. Temporary write workflow removed. Browser verification pending; no attendance handlers, storage, permissions, routes or data altered. Added overflow diagnostics without weakening assertions.
- P07 new class-monitor checks prepare a genuine synthetic published exam and a draft and exercise read-only class, pupil, exam and return navigation. Geometry assertions on class cards, metrics and 200% text; not yet run. This does not close P07 or broader P05/P06 coverage.

## Existing scene regression discovery

- Added a one-shot, read-only development workflow `.github/workflows/visual-polish-breadth-development.yml` with separate disposable fixture stacks for P05 family, P06 attendance/offline, P07 academics, P08 communication, P09 calendar, P10 finance and P11/P12 navigation/motion. It runs the existing test files and domain assertions without modifying them; artifacts stay within the runner. This is supplementary discovery on the current candidate, not final release CI or coverage signoff. No deployment, production access, or PR creation. Remove the branch-only development workflow before final release. Results pending.

- Added `COVERAGE.md` mapping each discovery scene ID to narrow observed runtime evidence or an explicit OPEN state. No scene or element was marked audited; the registry and visual review gates remain unchanged.
