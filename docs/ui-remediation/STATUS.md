# UI remediation — implementation status

Implementation plan: user-supplied `IMPLEMENTATION_PLAN.md`, tasks UIX-00…UIX-18. Source audit: user-supplied `SOURCE_AUDIT/REPORT.md` and `audit.json`. No performance, hosting, backend, finance, auth, migration, branding or production-data work is authorized.

## Latest verified UIX continuation — 22 November 2026

> This is the authoritative continuation checkpoint. Entries below that cite earlier SHA `17e90445` or earlier pending runs are retained as **historical evidence**, not the current blocker list.

- **Code checkpoint:** `85351e22aef4ebbbcc0e02367be56f01105801cd`, [Draft PR #2](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/pull/2), [CI run 45037680245](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/45037680245) **SUCCESS**. The branch stays unmerged and undeployed.
- **UIX-01:** Focused screenshot runner now invokes `assertCompleteAudit` on its actual Chromium captures. Four critical gates are strict: HTTP/redirect and terminal state, exact role/locale/route/width/**mode** target matrix, nonempty SHA, and physical PNG existence. Verified **14/14 Node policy tests** RED→GREEN and **90/90 role-matrix scenes** under CI. Historical 416-route replay has **not** been performed.
- **UIX-17:** Original synthetic unconfigured Teacher attendance is still checked as HTTP **503 + `unavailable` + localized Retry** in the 46-test role matrix. A **separate second phase** uses existing `setUpCalendar` on loopback-only Supabase and verifies **12 configured READY scenes**, Teacher AR/DE × 320/390/430/768/1024/1280, HTTP 200 and a selectable class/unstarted sheet. New attendance test **1/1 PASS**; existing focused Chromium suite **46/46 PASS**. Screenshots + manifest/videos in [artifact 14761090439](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/45037680245/artifacts/14761090439). Do **not** count the 503 captures as READY.
- **TDD:** [RED run 45036324813](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/45036324813) failed specifically on attendance HTTP 503 vs 200, after its original 46 tests passed. [GREEN run 45036992223](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/45036992223) passed the original 46 plus the new READY test. The combined screenshot-policy run passed again on `85351e2`.
- **Preservation:** Original audit's **19/19 findings** and **416/416 archival PNGs** remain diagnostic, unmodified and **not** golden snapshots. No source SQL migrations, native Android product changes, auth/finance permissions, production data or deployment were made in this continuation.
- **UIX-18 / review gate:** Handoff documentation, motion Before/After/Why and existing Draft PR retained. **OPEN:** entire historical runner parity, whole-product `pnpm qa:all`, Firefox/WebKit, real iOS/Android devices, native APK installation, external independent human review, and explicit owner visual approval. The browser evidence does not certify these.

## Baseline and repository safety — 2026-11-21

- Repository: [ahmedmohameda7222-ship-it/Madrasty-el-arabia](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia).
- GitHub `main` at preflight: `bb00bdd27a8915af54ac547e23ae425946e70fbe`.
- Existing `fix/ui-audit-coverage-mobile-2026-11-21` at preflight: `d8a0db07d036eca7e335cc1ab3fd4e563de2d942`, **24 commits ahead and 0 behind main**.
- Previous branch modifies `apps/web/src/app/school.css` (+5 lines) and introduces QA screenshot policy/runner, tests, scripts, workflow and retry diagnosis. **Do not blanket merge/cherry-pick**; reuse after reviewing target behavior and testing.
- Dedicated branch `fix/emil-ui-motion-audit-2026-11-21` was created from the above `main` SHA; no writes to `main`.
- Source instructions read: `AGENTS.md`, `PLANS.md`, `PROGRESS.md`, `docs/superpowers/specs/ui.md`. The new explicit UI test-first instruction supersedes the historical build-phase deferral for *this UI scope only*.
- Important: `PROGRESS.md` reports a **separate local, uncommitted attendance/QA change** after Q08. A remote GitHub API cannot enumerate uncommitted laptop/worktree changes. None were accessed or overwritten. Do not conflate GitHub `main` with a laptop working tree.
- Emil references consulted: `mobile-native`, `emil-design-eng`, `review-animations` and `STANDARDS.md`, `break-ui`. The connected design preflight service returned UNAVAILABLE; record this limitation rather than asserting it passed.
- Implementation environment limitation: the current container cannot resolve github.com for git clone (DNS), and has no `pnpm`; GitHub connector supports remote branch, file and commit operations. Browser/fixture/Android tests and device screenshots **have not been executed** in this environment.

## Issue count and manifest gate

The supplied audit has **19/19 expected IDs** and **416/416 actual archived PNGs**. See [ISSUES.md](ISSUES.md), with representative route, role, locale, width, evidence category, owner and source screenshot per ID. UI-19 is a positive baseline to protect rather than a defect to redesign.

## Task checkpoints

| Task | Phase | Status | Verification / next gate |
|---|---|---|---|
| UIX-00 | 0 | Inventory recorded; browser/local-worktree gates unavailable | GitHub branch refs and archive inventory verified; see logs; full local status unavailable |
| UIX-01 | 0/4 | Focused real-capture policy wired to 90/90 scenes; 14/14 policy tests GREEN; historical 416-runner parity still open | [CI 45037680245](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/45037680245) on 85351e2; synthetic browser verification only |
| UIX-02 | 0 | RED → GREEN verified in isolated Chromium | RED run 44893054000 failed expected; GREEN run 44893313926 1/1 passed; types and build passed; no device verification |
| UIX-03 | 1 | RED → GREEN verified in Chromium | RED 44893561314; GREEN 44893854146: 2/2 targeted tests passed; types/build passed; mobile device pending |
| UIX-04 | 1 | RED → GREEN verified Chromium at 320/390/430 across ar/de | RED 44894123403; GREEN 44894423678: 3/3 tests pass, TypeScript and build succeed |
| UIX-05 | 1 | RED → GREEN verified including mobile DE abbreviated and full desktop/ARIA text | Run 45034346415 includes 320/390/430, 200% and 1024px desktop; actual phone pending |
| UIX-06 | 1 | RED → GREEN verified in isolated Chromium | Run 44925691878: 5/5 tests passed including long child at ar/de 320/390/430 and 200% selector; typecheck and build passed |
| UIX-07 | 2 | RED → GREEN verified for shared empty/error states | Run 44927327255 8/8 Chromium tests pass; typecheck and build pass. More roles/state variants unverified |
| UIX-08 | 2 | RED → GREEN verified: four persona/locale cases | CI 44932593380 12/12 Chromium, types/build passed. No linked child / revoked scenario separate acceptance |
| UIX-09 | 2 | RED → GREEN verified in isolated browser | Run 44933487892: 16/16 Chromium, typecheck and build passed; first-child AR/DE, switch, zero children, invalid child deep-link |
| UIX-10 | 2 | RED → GREEN verified incl. visual follow-up in isolated Chromium | Run 44972314607: 19/19 tests, typecheck/build; 320px German long shortcut contained and pressed-filter visually distinct, screenshots inspected |
| UIX-11 | 2 | RED → GREEN verified in isolated Chromium (25/25), screenshot review done | Run 44973086473 on dde92394: 25/25 browser tests, TypeScript/build passed; Students, class-year and child-detail width fixes. Child action links remain densely packed (separate visual finding) |
| UIX-12 | 2 | RED → GREEN verified in Chromium (28/28), screenshots captured | Run 44973950376 on fe2edfaa: three date/locale tests passed, ISO unchanged, TypeScript/build and prior 25 pass; native placeholders remain browser-dependent |
| UIX-13 | 3 | Verified no-change: native sheet passed 2/2 targeted tests; full 30/30 Chromium | Run 44974444576, Arabic 390 and German 320, repeat/ESC/focus/select/reduced motion; no interaction defect requiring custom animation |
| UIX-14 | 3 | RED → GREEN verified; 33/33 isolated Chromium, TypeScript/build passed | Run 45024262605 on 5323788e: AR admin 390, DE guardian 320, DE admin 1280. Repeated open/close, keyboard, reversible arrow 140ms, reduced-motion, screenshot/video artifact 14755556508 |
| UIX-15 | 3 | RED → GREEN verified; whole-web CSS negative checks and token consistency | Run 45025131948 on 8f67d62a: 35/35 isolated Chromium, TypeScript/build; no new animation library, 140ms shared ease-out, reduced-motion |
| UIX-16 | 3 | Verified no-change preservation: 39/39 isolated Chromium, TypeScript/build | Run 45025567730 on 253d371d: native Android source contracts and web viewport/dark/reduced at 320/390/430 passed; hardware/IME unverified |
| UIX-17 | 4 | Focused Chromium 46/46 + separate configured Teacher READY 1/1 GREEN; 90 strict matrix + 12 READY captures | [CI 45037680245](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/45037680245); 503 negative and HTTP200 READY independently exercised; device/full QA pending |
| UIX-18 | 4 | Draft PR #2, issue status reconciliation, final evidence ZIP and motion review documented; owner exit gate OPEN | ACCEPTANCE/MOTION_REVIEW docs, CI 45034346415, independent external review and live devices pending; no merge/deploy |

## Verification taxonomy — updated 2026-11-22

- **QA_ENV_ONLY automated GREEN:** [CI 45034346415](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/45034346415) on 17e90445: `pnpm check:types`, `pnpm build:web`, screenshot-policy/overlay-policy tests and 46/46 isolated Chromium tests passed.
- **Captured, not owner-approved:** 90 UIX-17 role-matrix screenshots plus one targeted screenshot, six manifests and videos in artifact 14758948669. The historical 416 captures are diagnostic, not goldens or regenerated acceptance.
- **Both attendance fixture states VERIFIED (isolated Chromium):** 503 `unavailable` with localized Retry remains the negative case; a second test seeds only local QA school/calendar and verifies Teacher READY at 12 AR/DE widths (CI 45037680245).
- **Unverified:** full `pnpm qa:all`, full historical runner revalidation, physical iOS/Android/IME, Android APK build/install, actual phone touch and an external independent reviewer.
- **Unchanged/not authorized:** main, production Supabase and school data, Vercel, signed APK, migrations, authentication, finance and data contracts.

## Dependencies and rulings

- UIX-01 screenshot terminal-state contract precedes meaningful UIX-17 visual acceptance. Screenshot capture and UIX-17 must not accept a 404 without role-specific permission evidence.
- UIX-02 synthetic *display* names precede long-name layout acceptance in UIX-06. IDs remain immutable identities.
- UIX-03–06 and UIX-11/14/15 share `school.css`: coordinate sequential diffs; do not overwrite independent fixes.
- UIX-07 state semantics precedes role-specific academic states in UIX-08.
- Existing correct `100dvh`, safe-area padding, `viewport-fit=cover`, semantic `<dialog>`, and reduced-motion support must survive.

## Commands and evidence requirements for subsequent execution

```bash
git status --short --branch
git rev-parse HEAD
git branch -a
git diff --check
pnpm install --frozen-lockfile
pnpm check:types
pnpm build:web
# Isolated synthetic fixture only:
pwsh -File qa/start-stack.ps1
pwsh -File qa/local.ps1 -Serve
pnpm exec playwright test --config qa/playwright.config.ts qa/web/ui-header.spec.ts --project=edge
pnpm qa:all
```

No command from the block above has been represented as successful in this document. Before declaring a task done, record actual command, output/exit status, role, locale, width, state, capture/video and SHA. GitHub CI, when present, does not substitute for physical-device verification.

## UIX-01 policy-only regression evidence

- Local scratch files were verified byte-identical to the GitHub blobs (`git hash-object` matched the uploaded blob SHA for both files).
- `node --test qa/screenshot-audit-policy.test.mjs` on the prior screenshot policy: exit **1**, 5 intended RED cases failed and 4 passed (loading accepted; terminal state absent; unverified 404 accepted; wrong-width attempt overlooked; redirect accepted).
- Same command on the corrected policy: exit **0**, **9 passed**, **0 failed**; `node --check` succeeded for both files. The two complete logs are retained in the conversation output artifacts.
- This verifies **pure Node classification logic only**, not the Playwright screenshot runner nor page readiness, component behavior, CI, types/build or device UX. The runner must populate real terminal state and exact target pairs before this policy can govern visual acceptance.

## UIX-02 browser RED evidence

- GitHub Actions run [44893054000](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/44893054000), browser-fixture job `136812808875`, commit `619b5d20`.
- `pnpm exec playwright test --config qa/ui-remediation.config.ts` exit **1**, **1 failed**, **0 passed**. Explicit failing assertion: `fixture run ID must never be displayed as a child's name`; actual rendered hero was `QA Ahmed (qa-a8aa5cc33da043cf84934a415cddaabb)`. This proves the issue with **isolated synthetic fixtures**, not production.
- The RED workflow used an output directory relative to the config so its upload step did not find screenshots; corrected evidence output paths with the GREEN commit. No RED screenshot ZIP was uploaded, but the full failure stack and actual text remain in the GitHub job log.
- This task's changes are confined to `qa/fixtures/local.sql`: visible names only. Stable `source_namespace`, `external_key`, `run_id`, email fixture identity, linked family records and permissions are unchanged.

## UIX-02 GREEN checkpoint

- Run [44893313926](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/44893313926) on `a8dc6b62`: **browser-fixture succeeded**, Chromium **1 passed / 0 failed**, and the separate static job `pnpm check:types`, `pnpm build:web`, and 9 screenshot-policy unit tests all passed. Artifact `madrasty-ui-fixture-qa` ID `14703092042` is available in that GitHub Actions run.
- Automated scope is guardian hero and German homework selection, using a disposable database. Other pages, full QA and real device still pending. A single source-name fix does not certify every UI screen.

## UIX-03 RED checkpoint

- GitHub Actions run [44893561314](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/44893561314), browser job `136814333012`. `pnpm exec playwright test --config qa/ui-remediation.config.ts`: **1 expected UIX-03 failure, 1 UIX-02 regression passed**. The computed native control style on `/ar/account/sign-in` was `touch-action: auto` instead of `manipulation`. The run retained screenshot, WebM and Playwright trace (artifact `14703231543`).
- The fix adds scoped 120ms pointer press feedback, preserves focus/selection semantics, gates hover by pointer precision, provides reduced-motion override, and leaves generic content selectable. CI GREEN and real-device tap feel are not yet established.

## UIX-03 GREEN checkpoint

- [Run 44893854146](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/44893854146) on eba9231a: isolated Chromium **2 passed / 0 failed**, 9 screenshot-policy unit tests, TypeScript check and web build passed. Physical touch device not verified.

## UIX-04 RED checkpoint

- [Run 44894123403](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/44894123403), browser job 136816000892, RED 1 failing / 2 passing. At 320px German the actual logo center was y=34px, title y=88.64px and language link y=88.64px; assertion allowed <=20px and observed 54.64px. Evidence artifact 14703451938, isolated guardian test only. The fix constrains header flex children and retains the full accessible brand name. Browser GREEN and 200% text pending.

## UIX-01 QA-only developer-badge regression

- Locally ran `node --test qa/qa-overlay-policy.test.mjs` against unchanged Next config: exit **1**, expected RED because no disposable-QA flag gated the Next dev badge. The same Node test after the conditional config: exit **0**, 1 passed. Logs in source handoff output archive. Conditional `devIndicators` only affects QA_SCREENSHOTS_ONLY=1; ordinary local dev and production config remain unchanged.
- This does **not** finish UIX-01: terminal-state DOM classification, role-specific forbidden routes, full screenshot runner integration and visual acceptance remain pending.

## UIX-04 GREEN checkpoint

- [Run 44894423678](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/44894423678) on d160f8be: 3/3 isolated Chromium regressions passed; 9 screenshot-policy and 1 QA-only-overlay Node tests, TypeScript check and web build passed. Brand name remains fully available through the existing aria-label; 200% zoom was not part of the UIX-04 GREEN browser assertion.
- UIX-03/UIX-04 success screenshot paths and full isolated browser motion recordings are now captured automatically by the shared QA runner, never approved as golden references.

## UIX-05 RED checkpoint

- [Run 44895089775](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/44895089775): browser-fixture 1 expected failure / 3 passes. On `/de/school/attendance`, selected tab `aria-current=page` worked, but `aria-label` was absent. Before screenshot + WebM + trace in artifact 14704010234. The visible title wraps in the source audit; proposed abbreviated label preserves `Anwesenheit` for assistive tech. This fix changes only the shared nav's German attendance tab and QA evidence capture; other nav destinations untouched. GREEN pending.

UIX-05 desktop-preservation ruling: The approved change addresses the cramped mobile navigation; the normal 1024px rail must retain full `Anwesenheit`. The first green browser check only checked mobile; a separate RED/GREEN regression prevents an accidental desktop UI change.

## UIX-05 desktop RED evidence and QA repair

- [RED run 44924619647](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/44924619647): browser 2 failed / 2 passed. The desktop nav test received Anwes. instead of Anwesenheit at 1024px.
- The long-name fixture test also failed because the default first child was the valid short name نور (three characters). Child ordering is not guaranteed. The repaired test selects the long name via the actual scope dialog rather than changing the expected length or mocking DOM data.
- Implementation preserves Anwes. below 960px, displays the full term in the desktop rail, and keeps the accessible name across both widths. GREEN verification pending.

## UIX-06 RED evidence and targeted fix

- [RED run 44925417089](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/44925417089): Playwright browser 1 expected failure and 4 previous tests passed. The actual native child select at 320px RTL had `left=-364px` (expected >=-1px); artifact 14715134191 includes screenshot, video and trace.
- The first hero checks (long name via real scope sheet, aria-label, hero viewport bounds, CTA, main overflow) had passed before the select failure. The fix ports the independently reviewed `label.auth-card` grid and select min-inline-size rules from the prior QA branch without modifying any academic or auth logic.
- The task remains pending until the complete ar/de/320/390/430/200% browser regression and affected static checks pass.

## UIX-06 GREEN checkpoint

- [Push run 44925691878](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/44925691878) on 8e405a74: 5/5 Chromium tests, TypeScript and web build passed. UIX-06 test covered 320/390/430 Arabic/German and 200%-text selector containment. Component-only hero/select images and WebM in artifact 14715478555.
- Separate pull_request run 44925696556 failed during local Supabase startup before any browser test. Push run on the same commit passed all five tests. Because the feature branch's push already exercises the same isolated check, the duplicate pull_request trigger is removed. This changes CI test scheduling, not hosting, application performance or production behavior.

## UIX-01 terminal-state follow-up

- Existing accepted screenshot examples include a guardian-home skeleton and an attendance error state despite filenames containing `ready`; these are diagnostic captures only. Their terminal-state acceptance remains blocked until state is machine-readable and the runner checks it.
- The new browser RED test holds a synthetic /me/children response and requires AsyncSurface to expose loading state before screenshot capture. Add the smallest DOM marker after the expected RED result, then rerun affected tests.

## UIX-01 loading-state RED evidence

- [Run 44926108339](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/44926108339), browser-fixture job 136912439167: `pnpm exec playwright test --config qa/ui-remediation.config.ts` 5 passed / 1 expected RED. The pending `p[role=status]` was present and contained `Wird geladen`, but the requested `data-async-state=loading` attribute was null. No timing, content, permission, or endpoint change is needed; adding just the state attribute allows the screenshot runner to reject unresolved loading frames. GREEN pending.

## UIX-01 pending-state GREEN checkpoint

- [Run 44926490492](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/44926490492) on b04b3cd6: 6/6 isolated Chromium tests passed, screenshot-policy Node tests passed, typecheck and web build passed. Test held /me/children so the loading marker was validated on a real unresolved asynchronous state. This verifies the state marker only, **not** complete screenshot terminal-state acceptance.

## UIX-07 RED evidence

- [Run 44926833430](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/44926833430), isolated Chromium: six earlier tests passed; both new tests failed for the expected missing `data-async-state` attribute. Empty locale text was rendered in German, and a simulated `/api/v1/academics/homework` HTTP503 produced a notice with actual `role=alert`; neither error was misclassified as a network setup failure. Artifact 14715898338 has screenshot/video/trace.
- Fix adds explicit empty/filtered-empty and error/offline/forbidden DOM state without changing API paths, retry handlers or the existing discriminated union. The empty notice retains its optional action slot; the two verified guardian states expose no unauthorized actions. GREEN pending.

## UIX-07 GREEN checkpoint

- [GitHub Actions run 44927327255](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/44927327255) on d81db860: isolated Chromium **8 passed**, static unit tests, TypeScript and web build passed. Scope: one real empty academic path (Arabic and German) and one synthetic HTTP503 retry error; not proof of every error/permission state. Tests and changes in QA-only branch.

## UIX-08 RED checkpoint

- [GitHub run 44931521430](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/44931521430) on 3868632f: 4 new Chromium cases failed for expected missing contextual guidance (guardian-de homework, guardian-ar exams, teacher-de evaluations, admin-ar exams), while 8 previously verified regressions passed. Screenshots, videos, and traces are in artifact 14717978145. The pages displayed actual generic empty statuses; none redirected or failed to load.
- Minimal fix populates the existing AcademicPageItems.emptyMessage and adds optional staffEmptyMessage for unassigned offerings. No new CTAs or change to data, permissions, filters, mutations, exams, or grading. After screenshots added to the targeted test. Await GREEN.

## UIX-08 initial GREEN run and stale assertion

- [Run 44932187563](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/44932187563): all four new role/locale empty-state tests passed in isolated Chromium; eight older tests included one failure because `ui-empty-states.spec.ts` asserted the **old generic string** that UIX-08 intentionally replaces. 11/12 browser passed, TypeScript and build passed. This is an assertion-contract change, not a working UI regression; the revised prior test asserts the new context-specific text with all ARIA/data-state/CTA checks preserved. Final GREEN rerun pending.

## UIX-08 GREEN checkpoint

- [Run 44932593380](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/44932593380) on 1efe05ed: 12/12 Chromium tests passed, typecheck and build passed; four role-specific academic messages verified, four after-screenshots and interaction recordings included in artifact 14718287556. Diff limited to existing academic components, tests and status, no API/security/business changes. Filter/no-selected-child and permission states still need broader matrix acceptance (UIX-17).

## UIX-09 RED checkpoint

- [Run 44932927033](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/44932927033) on dc6c1897: four new Playwright tests failed for expected missing child context, with all prior 12 tests passing; screenshots and traces in artifact 14718497766. First-load detail was absent for Guardian AR (390px) and DE (1280px); simulated no-linked Guardian DE had a generic empty notice; invalid valid-UUID child deep-link silently showed no forbidden state.
- The fix limits automatic selection to the first member of the authorized `available.data` list and only if there was no requested child. An explicit but invalid child ID does not fall back to another child's private details. Empty list copy explains the next safe offline step without creating permissions or new routes. GREEN pending.

## UIX-09 GREEN checkpoint

- [Run 44933487892](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/44933487892) on 9e0a3e35: 16/16 Chromium, types and build passed. UIX-09 four RED cases all GREEN in fresh isolated QA. Artifact 14717954494 includes screenshots and videos; no production user data touched. Invalid deep-link remains forbidden and no other child's detail leaks.

## UIX-10 RED checkpoint

- [Run 44933830550](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/44933830550), Chromium 16 passed / 2 expected RED; both Arabic Admin 390 and German Guardian 320 search actions were 54px below input center. Artifact 14718494063 contains failure screenshots, video and trace.
- Scoped CSS and ThreadInbox markup align the search action with the native input, move filters into a horizontally scrollable strip on mobile, collapse only secondary directory/broadcast shortcuts, and retain the archive toggle with identical state/query. Desktop retains the original shortcut row and no search/filter or thread-query logic changed. GREEN browser and visual review remain pending.

## UIX-10 first GREEN plus visual-review follow-up

- GitHub [run 44971491777](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/44971491777) retry: 18/18 Chromium, typecheck/build passed. Artifact 14734400554 contains AR admin 390 and DE guardian 320 after screenshots. Original attempt on same SHA failed before browser tests during disposable Supabase startup, not due to UI.
- Actual DE 320 image has unbroken `Kontaktverzeichnis` text extending beyond its button background when mobile shortcuts are expanded. The selected `Alle` filter has no differentiated background versus inactive chips in the rendered image. Do not mark UIX-10 visually accepted; RED tests are added for both issues before scoped styling.

## UIX-10 visual RED checkpoint

- [Run 44972014383](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/44972014383), browser: 16 prior tests passed, three expected visual regressions failed. Arabic/German selected filter and inactive filter both had `rgb(237, 242, 248)` backgrounds; `Kontaktverzeichnis` text started at x=118.58 while its touch target starts at x=134.31. The test verifies visual contrast and real text DOMRange containment (not source matching). No product/backend code changed during RED.
- Scoped CSS now styles the selected chip with theme tokens and lets long shortcut labels wrap inside their own accessible targets. Focus/target sizes unchanged. Await GREEN on fresh isolated browser evidence and screenshot review.

## UIX-10 final GREEN and visual review

- [Run 44972314607](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/44972314607) on d832267c: 19/19 isolated Chromium tests, TypeScript and build succeeded. The two AR/DE visual-state tests and German DOMRange containment now pass; last screenshot inspected and visible selected green filter, long strings within gray buttons. Artifact 14734376836; behavior tested only Chromium 390 AR Admin / 320 DE Guardian, not physical devices or full matrix.
- One additional nuance: test screenshots are taken after archive toggling and expanding shortcuts, so archive and initial inbox state screenshots should be separately recorded at UIX-17. No production message query or permission contract changed.

## UIX-11 RED checkpoint

- [Run 44972722857](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/44972722857) against 43d5a717: three expected failures at desktop 1280px — Students single panel was 480px, Class year selector 976px and Guardian child details 976px. Admin Students at 768/1024 and wide Guardian Home preserved, plus all 19 earlier regressions passed. Archived screenshots are diagnostic, not approved goldens.
- Fix applies `family-single-panel` only while no editor is open; selecting/editing a record retains the original two-column layout. `class-year-panel` and `guardian-child-panel` constrain short desktop forms/readable child details only. No global `.auth-card` width rule, no permission/data/route change. GREEN and visual review pending.

## UIX-11 GREEN and visual review

- [Run 44973086473](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/44973086473) on dde92394: browser 25/25, TypeScript/build and screenshot-policy tests passed. Artifact 14733799091 has five changed-page screenshots and motion videos. Direct image review confirms centered Students, class-year and Guardian-child sections; the crowded inline Guardian child shortcut links are logged as a later visual issue (not part of UIX-11 geometry contract).
- UIX-12 is scoped to semantic accessible hints for browser-native date/month inputs. No new calendar dependency or ISO parser modification permitted.

## UIX-12 RED checkpoint

- [Run 44973606320](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/44973606320) on ba95de3a: three new Chromium tests failed for expected `aria-describedby=null` on live Arabic finance / German attendance / German learning report native date inputs. All earlier 25 browser tests, static checks, types and build passed; screenshots/videos/traces in artifact 14734238347.
- Targeted fix retains native `type=date/month` inputs, ISO values, validation and filters. Reuses one localized accessible `small#date-format-*` description across related date controls, with a separate month example. Explicitly acknowledges that the browser decides native display order; no custom datepicker or timezone transformation. Fresh GREEN pending.

## UIX-12 GREEN checkpoint

- [Run 44973950376](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/44973950376) on fe2edfaa: 28/28 isolated Chromium, TypeScript and web build passed. Three UIX-12 form captures in artifact 14734019653; native date format remains determined by Chromium locale. The app now explicitly warns of that and offers a localized example; ISO storage unchanged.
- UIX-13 scope-sheet source check: the existing component uses native `showModal`, `close` event focus restoration, semantic dialog and safe-area bottom offset. `de/school/more/assignments` currently has no ScopeSheet consumer; test the two real consumer routes rather than invent a new sheet. Ruling: do not add motion without demonstrated interaction benefit; existing absence of custom motion is not itself a defect.

## UIX-13 verification and no-change ruling

- [Run 44974444576](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/44974444576): 30/30 isolated Chromium, TypeScript/build passed. Two new modal behavior tests passed *without modifying product code*. Semantic `<dialog>`, Escape, close-form button, focus restoration after selection and repeated opening, bottom placement, reduced motion all verified. Artifact 14735490373 screenshots reviewed; backdrop and safe-area placement appear correct. Ruling: do not introduce extra motion without demonstrated benefit; tests preserve correct native behavior. Physical device and IME interactions unverified.

## UIX-14 RED checkpoint

- [Run 44974843209](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/44974843209) on ec2b7f75: 30 previous Chromium tests passed; 3 new disclosure checks failed on the expected `animationName=more-enter` across AR admin 390, DE guardian 320 and DE admin 1280. TypeScript/build passed. Root cause was CSS entry-only keyframes, which re-trigger at each opening without corresponding close motion.
- Scoped fix removes the `more-enter` keyframe and instead transitions only the existing disclosure arrow's transform for 140ms; reduced-motion disables this transition. Native `<details>` toggle, keyboard/links, colors, hit targets and layout unchanged. Fresh GREEN and visual review pending.

## UIX-14 verified; UIX-15 motion review checkpoint

- [UIX-14 run 45024262605](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/45024262605): 33/33 isolated Chromium tests (30 prior + 3 targeted), TypeScript and web build passed on 5323788e. Artifact 14755556508 contains screenshots and interaction videos. DE Guardian 320 screenshot directly reviewed: disclosure rows visible, arrow orientation clear, keyboard tests passed. The screenshot also shows bottom-nav German `Nachrichten` broken across two lines at 320; record for UIX-17, do not silently call the entire shared shell accepted.
- UIX-15 code audit follows the source of `emilkowalski/skills/skills/review-animations/STANDARDS.md`: purposeful feedback, no frequently repeated entry keyframes, under-300ms UI, strong shared ease-out, no layout-property animation, reduced-motion fallback. Existing `--ease-out` is custom cubic-bezier; UIX-14 arrow currently uses built-in `ease-out`, so browser RED test compares computed easing against the existing token. Other negative checks should pass with no product change.

## UIX-15 RED checkpoint

- [Run 45024782971](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/45024782971) on f407c598: 34/35 isolated Chromium tests passed, including negative source motion scan; targeted computed CSS check RED because More arrow used built-in `ease-out` rather than existing shared `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`. No unintended `transition:all`, zero-scale entry, ungated row keyframe, or new library found. TypeScript/build passed.
- Minimal change updates only the `.more-group summary::after` easing to the existing token, retaining 140ms duration, reduced-motion cutoff and no row motion. Fresh browser GREEN pending; no animation added to dashboards.

## UIX-15 GREEN checkpoint

- [Run 45025131948](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/45025131948) on 8f67d62a: 35/35 isolated Chromium, TypeScript/build passed. The source-scan negative test and browser's computed shared easing both green; artifact 14755398519 includes UIX-15 screenshot, video, trace-on-failure policy. No extra animations or libraries, no dashboard motion.
- UIX-16 preservation gate is explicitly web browser plus Android *source-level only*. Native APK build, iOS Safari physical safe area, Android device interaction and keyboard IME behavior remain **UNVERIFIED** until those environments are exercised. No native shell code modification authorized by a passing negative check.

## UIX-16 complete; UIX-17 first visual finding

- [Run 45025567730](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/45025567730) on 253d371d: 39/39 isolated Chromium passed, types/build green. Four native-preservation tests verify web viewport/safe-area/RTL-LTR/44px, and static presence of Android Compose Scaffold, NavigationBar, ModalBottomSheet and IME handling. No production code modified. This is **not** Android APK compile or physical-device proof.
- UIX-17 begins with a fresh, objective test based on a real 320px German Guardian More screenshot captured in UIX-14: the `Nachrichten` navigation label splits inside the word. Test measures rendered line height and, if corrected to a shorter visual label, requires the full screen-reader name. Then broaden to all roles × locales × six viewport widths and target states; no golden auto-approval.

## UIX-17 first RED checkpoint

- [Run 45026033637](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/45026033637) on 491e0a53: 39 earlier Chromium regressions passed; only new German 320px bottom-nav message label failed as predicted (visible span 36.19px high for 18.10px line height). Issue was hard mid-word wrapping, not body horizontal overflow or backend. Static checks and build pass.
- Scoped remedy reuses existing German attendance nav compact-label pattern for messages: mobile visible `Nachr.`, desktop visible `Nachrichten`, link `aria-label="Nachrichten"`; unchanged route, icon, keyboard, RTL, other locales, no CSS or route contract changes. GREEN screenshot and full UIX-17 acceptance matrix still pending.

## UIX-17 initial GREEN and broad acceptance matrix

- [Run 45026514391](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/45026514391) on fd961721: 40/40 isolated Chromium, TypeScript and web build passed, including German 320px message-tab single-line accessible-name fix. Artifact 14755747826.
- New matrix checks all 6 persona×locale combinations (Admin, Teacher, Guardian × Arabic/German). Each suite captures More at 320/390/430/768/1024/1280; Home/role-specific screens at 390/1280; inbox at 320/390/430; plus 200% root text on Home at 390 and dark/reduced motion on More at 430. Requires settled `loading` marker, correct route/role, no error/forbidden masquerading as ready, document overflow <=1 CSS px, and all four nav targets >=44px. Captures are diagnostic, not golden or owner-approved. CI manifests include SHA/browser/state/route/width/mode. Full isolated QA, physical-device checks and role-specific permission variants remain separately reported.

## UIX-17 trace diagnosis: missing synthetic school calendar

- [Run 45026985338](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/45026985338) on fc9b697f: 44 passed, 2 failed. Admin AR/DE and Guardian AR/DE matrices captured 15 verified terminal screens each. Both Teacher scenarios reached `/attendance` and received HTTP **503** on `GET /api/v1/attendance/classes`; browser trace response body was `{"error":{"code":"unavailable",...}}`. This occurred after eight passing Teacher shell/Home captures, not a broken redirect or a permission 403.
- Root-cause inspection: `readAttendanceClasses()` uses `schoolDate()` and throws `unavailable` when `app.school_today()` is null; `qa.seed_actor` / `qa.seed_family` create principals and children but do **not** configure `app.school_settings` or a school calendar. This is a **QA_ENV_ONLY** state, not evidence of a production attendance defect. Do not change business logic or treat every API failure as success.
- Acceptance protocol explicitly verifies the specific attendance response **503 + code unavailable**, visible localized alert, Retry button, and no forbidden state. Its manifest records `error-unconfigured-school-calendar`, never `ready`. A separate populated Teacher attendance **ready** scenario has since passed in the isolated local calendar fixture ([CI 45037680245](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/45037680245)); full operational attendance QA remains **UNVERIFIED**. Fresh GREEN verification pending.

## UIX-17 final browser checkpoint / UIX-18 owner handoff

- [Run 45034346415](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/45034346415): 46/46 isolated Chromium GREEN (5.5 minutes), TypeScript/build and policy checks GREEN. Six role×locale scenarios each captured 15 scenes; role/screen/viewport/state/SHA manifests stored in [artifact 14758948669](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/45034346415/artifacts/14758948669).
- [ACCEPTANCE.md](ACCEPTANCE.md) is task/QA evidence; [ISSUES.md](ISSUES.md) reconciles all 19 audit IDs; [MOTION_REVIEW.md](MOTION_REVIEW.md) is a Before/After/Why review of motion against Emil. Draft [PR #2](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/pull/2) is intentionally unmerged, undeployed and pending owner approval.
- Standalone review ZIP `Madrasty_El_Arabia_UIX00-18_Review_Evidence_2026-11-22.zip`, SHA-256 `c65e3b393f92cc963cf9971535723c9502b9de9fc5ff1d45744540cbbdc1d0a3`. Before images are historical diagnostic; after/video from synthetic Chromium, not physical phone. Device and full QA gates remain open.
