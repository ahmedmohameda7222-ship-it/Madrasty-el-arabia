# Madrasty El Arabia — UIX-00 through UIX-18 review and acceptance

**22 November 2026** · [Draft PR #2](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/pull/2) · Branch `fix/emil-ui-motion-audit-2026-11-21` · Evidence snapshot `17e90445a3a10cdc7c6eef4b2904edf6e9b367f4`.

This documents targeted UI remediation **rather than** whole-product or physical-device acceptance. The archived HTML preview was explicitly excluded as a visual reference. All tested identities are synthetic and the database was isolated.

## Current verification

| Verification item | Observed result | Evidence limit |
| --- | --- | --- |
| Chromium UI suite | **46/46 passing** (5.5 minutes) | [Run 45034346415](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/45034346415); synthetic fixture only |
| TypeScript and web build | `pnpm check:types`, `pnpm build:web` both passed | No production deploy |
| Screenshot/overlay policies | `node --test qa/screenshot-audit-policy.test.mjs`; `node --test qa/qa-overlay-policy.test.mjs` passed | Full legacy runner not rerun |
| Responsive matrix | Admin/Teacher/Guardian × AR/DE; More at **320,390,430,768,1024,1280**; Home and role view at 390/1280; Messages at 320/390/430; 200% root text at 390; dark/reduced at 430 | **90 screenshots**, six SHA/role/locale/state manifests, plus focused DE 320px message-tab shot |
| Teacher attendance | **HTTP 503** `unavailable` alert + retry verified, and **not** misclassified as ready | No calendar in isolated fixture; ready attendance BLOCKED |
| Physical iOS/Android | Not run | NEEDS_DEVICE |
| Whole-product `pnpm qa:all` | Not run | Extra browsers, Android and restore/rollback prerequisites not exercised |

**Exact verified CI sequence:** `npm install --global pnpm@11.25.0`; `pnpm install --frozen-lockfile`; `node --test qa/screenshot-audit-policy.test.mjs`; `node --test qa/qa-overlay-policy.test.mjs`; `pnpm check:types`; `pnpm build:web`; `pwsh -NoProfile -File qa/start-stack.ps1`; `pwsh -NoProfile -File qa/local.ps1 -Serve`; `pnpm exec playwright test --config qa/ui-remediation.config.ts`. Read full exact job logs in [GitHub Actions](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/45034346415).

## Task-by-task outcome

| Task | Result | Linked implementation or verification |
| --- | --- | --- |
| UIX-00 | 19 issues + 416 original screenshot paths inventoried; remote branch preflight, laptop local changes uninspectable | [inventory](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/commit/503a5dd03) |
| UIX-01 | Terminal-state and QA-overlay policy RED→GREEN; full historical runner pending | [run](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/44926490492) |
| UIX-02 | QA synthetic display names, backend identity keys unchanged, GREEN | [commit](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/commit/a8dc6b621) |
| UIX-03 | Touch press feedback/keyboard/reduced motion GREEN in browser; hardware pending | [commit](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/commit/eba9231a7) |
| UIX-04 | RTL/LTR mobile header 320/390/430 GREEN | [commit](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/commit/d160f8be1) |
| UIX-05 | German mobile attendance abbreviation with full ARIA/desktop label GREEN | [commit](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/commit/c21ba3849) |
| UIX-06 | Long child-name/selector containment and 200% cases GREEN | [commit](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/commit/8e405a742) |
| UIX-07 | Shared empty/error/denied distinctions GREEN, variants partial | [commit](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/commit/d81db8603) |
| UIX-08 | Role-specific academic empty messages GREEN | [commit](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/commit/5f406627e) |
| UIX-09 | Guardian child selection, zero-child and forbidden invalid link GREEN | [commit](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/commit/9e0a3e352) |
| UIX-10 | Mobile inbox hierarchy, long German shortcuts and pressed filter GREEN | [commit](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/commit/d832267cf) |
| UIX-11 | Desktop single-panel widths GREEN; Guardian child action density still flagged | [commit](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/commit/dde923947) |
| UIX-12 | Accessible Arabic/German native date hints and unchanged ISO dates GREEN | [commit](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/commit/fe2edfaac) |
| UIX-13 | Semantic native ScopeSheet verified, no product animation added | [regression](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/commit/c0b13a909) |
| UIX-14 | No repeated entry keyframe; 140ms reversible arrow and reduced-motion GREEN | [commit](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/commit/5323788ec) |
| UIX-15 | Negative motion checks and strong shared easing token GREEN | [commit](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/commit/8f67d62a2) |
| UIX-16 | Web safe area/viewport/RTL and Android Compose source preservation GREEN; hardware pending | [regression](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/commit/253d371d2) |
| UIX-17 | DE message-tab regression RED→GREEN, six role-locale matrix **46/46 GREEN**, Teacher ready sheet unverified | [fix](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/commit/fd9617215) · [CI](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/45034346415) |
| UIX-18 | Issue registry, Before/After/Why motion review, Draft PR and ZIP assembled; **exit gate OPEN** | [PR #2](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/pull/2) |

## Evidence and owner review

- [CI artifact 14758948669](https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/45034346415/artifacts/14758948669) contains 90 matrix captures + targeted capture, SHA manifests, videos and results; GitHub retains workflow artifacts for seven days.
- Standalone `Madrasty_El_Arabia_UIX00-18_Review_Evidence_2026-11-22.zip` (external download link supplied separately): SHA-256 `c65e3b393f92cc963cf9971535723c9502b9de9fc5ff1d45744540cbbdc1d0a3`. Contains archived baseline screenshots, current synthetic after captures, Chromium interaction recordings, manifests and command/log links. Historical captures are **diagnostic**, not auto-approved goldens or identical matched datasets.
- Review the 200%-text Guardian home/header and dense Guardian child-detail shortcuts visually. This is a request for owner assessment, **not** silent permission to redesign.
- Teacher's ready attendance, full legacy screenshot capture/404 policy, full `pnpm qa:all`, role/business/security flow breadth, non-Chromium engines, iOS Safari/Android physical safe areas/touch/keyboard, native APK compilation/installation and independent human review **remain unverified**.

## Scoped code safety

Latest source review before documentation showed this branch **44 commits ahead, 0 behind** `main`, 39 changed files, **no** SQL migrations or Android product changes. Earlier `fix/ui-audit-coverage-mobile-2026-11-21` was compared but not blindly merged. No production school data, finance/auth/MFA business changes, Vercel deployment, golden snapshot approval or `main` merge was performed. The review PR must remain a draft until explicit owner approval.
