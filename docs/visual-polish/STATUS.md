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
