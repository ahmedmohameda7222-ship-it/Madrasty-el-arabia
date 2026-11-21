# UI remediation — implementation status

Implementation plan: user-supplied `IMPLEMENTATION_PLAN.md`, tasks UIX-00…UIX-18. Source audit: user-supplied `SOURCE_AUDIT/REPORT.md` and `audit.json`. No performance, hosting, backend, finance, auth, migration, branding or production-data work is authorized.

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
| UIX-01 | 0 | Policy/marker RED → GREEN verified; full screenshot runner still unverified | Run 44926490492 6/6 Chromium, TypeScript and build passed; terminal capture integration pending |
| UIX-02 | 0 | RED → GREEN verified in isolated Chromium | RED run 44893054000 failed expected; GREEN run 44893313926 1/1 passed; types and build passed; no device verification |
| UIX-03 | 1 | RED → GREEN verified in Chromium | RED 44893561314; GREEN 44893854146: 2/2 targeted tests passed; types/build passed; mobile device pending |
| UIX-04 | 1 | RED → GREEN verified Chromium at 320/390/430 across ar/de | RED 44894123403; GREEN 44894423678: 3/3 tests pass, TypeScript and build succeed |
| UIX-05 | 1 | Mobile GREEN; desktop preservation RED confirmed; fix committed, GREEN pending | Run 44924619647: 1024px displayed Anwes. rather than Anwesenheit; first-child fixture test fixed separately |
| UIX-06 | 1 | RED → GREEN verified in isolated Chromium | Run 44925691878: 5/5 tests passed including long child at ar/de 320/390/430 and 200% selector; typecheck and build passed |
| UIX-07 | 2 | RED → GREEN verified for shared empty/error states | Run 44927327255 8/8 Chromium tests pass; typecheck and build pass. More roles/state variants unverified |
| UIX-08 | 2 | Focused RED academic empty-state tests committed; browser result pending | Four isolated guardian/teacher/admin Arabic/German scenarios asserting contextual empty copy and no unauthorized action |
| UIX-09 | 2 | Not started | Requires fresh RED → GREEN, browser/fixture evidence and affected regressions |
| UIX-10 | 2 | Not started | Requires fresh RED → GREEN, browser/fixture evidence and affected regressions |
| UIX-11 | 2 | Not started | Requires fresh RED → GREEN, browser/fixture evidence and affected regressions |
| UIX-12 | 2 | Not started | Requires fresh RED → GREEN, browser/fixture evidence and affected regressions |
| UIX-13 | 3 | Not started | Requires fresh RED → GREEN, browser/fixture evidence and affected regressions |
| UIX-14 | 3 | Not started | Requires fresh RED → GREEN, browser/fixture evidence and affected regressions |
| UIX-15 | 3 | Not started | Requires fresh RED → GREEN, browser/fixture evidence and affected regressions |
| UIX-16 | 3 | Not started | Requires fresh RED → GREEN, browser/fixture evidence and affected regressions |
| UIX-17 | 4 | Not started | Requires fresh RED → GREEN, browser/fixture evidence and affected regressions |
| UIX-18 | 4 | Not started | Requires fresh RED → GREEN, browser/fixture evidence and affected regressions |

## Verification taxonomy

- **Verified:** source archive count/path validation; GitHub branch refs and comparison.
- **Code only:** source comparison and previous branch inspection; **not** a passing visual test.
- **Blocked/unverified:** `pnpm install --frozen-lockfile`, `pnpm check:types`, `pnpm build:web`, targeted/full Playwright QA, screenshots/videos from the changed app, real iOS Safari/Android PWA, Android Compose regression.
- **Not attempted:** merge, deployment, Supabase mutation, live login, main branch modification.

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
