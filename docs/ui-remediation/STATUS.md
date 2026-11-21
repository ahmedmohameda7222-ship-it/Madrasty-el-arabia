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
| UIX-01 | 0 | Partial: pure capture-policy regression tests RED → GREEN locally; screenshot runner and browser checks pending | `node --test qa/screenshot-audit-policy.test.mjs` 5 expected RED failures against old policy, then 9/9 GREEN with new policy; browser and full fixture verification unverified |
| UIX-02 | 0 | Not started | Requires fresh RED → GREEN, browser/fixture evidence and affected regressions |
| UIX-03 | 1 | Not started | Requires fresh RED → GREEN, browser/fixture evidence and affected regressions |
| UIX-04 | 1 | Not started | Requires fresh RED → GREEN, browser/fixture evidence and affected regressions |
| UIX-05 | 1 | Not started | Requires fresh RED → GREEN, browser/fixture evidence and affected regressions |
| UIX-06 | 1 | Not started | Requires fresh RED → GREEN, browser/fixture evidence and affected regressions |
| UIX-07 | 2 | Not started | Requires fresh RED → GREEN, browser/fixture evidence and affected regressions |
| UIX-08 | 2 | Not started | Requires fresh RED → GREEN, browser/fixture evidence and affected regressions |
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
