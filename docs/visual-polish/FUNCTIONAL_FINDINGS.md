# Functional and QA findings

These observations are recorded separately from visual polish. File paths are repository-relative and evidence directories are local.

| ID | Observed behavior | Evidence | Next verification |
| --- | --- | --- | --- |
| QA-01 | The two Teacher cases in the older UI acceptance matrix wait for a browser response with HTTP 503. The configured local school instead rendered the attendance form with the empty state and the wait reached its original 120-second timeout. | `qa/web/ui-acceptance-matrix.spec.ts`, browser traces and error contexts under `qa-artifacts/ui-remediation-test-results/`. | Reproduce against the pinned product commit in a clean synthetic school and distinguish unconfigured service failure from a configured empty day. |
| QA-02 | Calendar and Admin oversight tests stopped before visual assertions with HTTP 409 `stale_revision`. The existing shared fixture PATCH sends revision 0 and the reusable local QA database had earlier school settings. | `qa/fixtures/calendar.ts`, `qa/web/ui-calendar-preview.spec.ts`, `qa/web/ui-admin-oversight.spec.ts`, local error contexts. | Run in a fresh disposable school for primary evidence. Check the fixture initialization contract separately from the UI. |
| OBS-01 | One immediate click of the settings action after a cold Next development reload did not open the dialog. It worked after the screen became interactive. | Live Edge 390 px, app running through the QA development server. | Verify on a production build under cold and warm cache in the P12 responsiveness pass. |
| QA-03 | Development-runner Chromium public install navigation did not advance; WebKit invitation/recovery and guardian preferences/profile navigations were interrupted by navigation to the preceding page. | GitHub development run 46079621892; Chromium 39/40, WebKit 38/40; all 29 added P04 checks passed in each. | Reproduce on a compiled production candidate with identical loopback fixtures, without weakening the navigation assertions. |

The local suite results above do not establish product regressions. App behavior and existing assertions were preserved.


### QA-04 — Production-build fixture bootstrap incompatibility (open)

Both browsers in development run 46080379411 stopped before UI tests with session HTTP 500. Production mode also requires verified database TLS and secure __Host- cookies; the established isolated loopback fixtures use development-mode cookies. Continue using the guarded dev fixture for visual tests; do not weaken production security to make QA pass. Production-mode evidence requires a suitably isolated TLS/HTTPS fixture environment.

### QA-05 — Android signed-out primary action (open)

Run 46080077890, both emulator sizes: 21/22 passed; sign-in visibility assertion failed. The screen uses the loading label while restoring a session. Bounded waiting for the disabled sign-in node was added without removing any original assertions. Confirm via re-run; if visibility still fails after restore, investigate layout and persisted locale/state rather than waive the check.


### QA-06 — hosted development runner cold navigation and resource failure

Run 46082187416 Chromium reproduced the existing cold German install navigation failure; all five original P03 cases passed when re-run on the warmed server. WebKit stopped before browser tests with sanitized startup category resource or port conflict. Neither is waived: exact cold startup/navigation investigation and a fresh WebKit run remain required. No authentication or navigation product changes made.


### QA-07 — finance domain follows a mutating UI fixture

46083875529 iPhone WebKit UI 5/5 passed, then the domain test hit 409 stale_revision at ledger.test.ts:73. Both suites reuse QA_RUN_ID; populated UI explicitly sets a payer designation, while the domain test writes revision 0. Fresh isolated domain run without preceding UI writes is the next discriminating test. No production code, assertion, or ledger rules changed. Keep failure open until fresh run result.

- QA-07 follow-up: first clean-domain diagnostic 46085666230 failed at initial bearer login because the actor fixture had not been seeded. Corrected the workflow to seed actors first. The stale-revision hypothesis still needs verification.

- QA-07 fresh seeded isolated domain run 46085891983 passed all original finance assertions. The reused-fixture ordering is confirmed as the discriminating factor in this diagnostic. No financial rules changed. QA-03 signed-out production build original public suite passed 4/4 per browser (46085892025); dev first-click/interrupted direct navigations and authenticated production test setup remain open.

- QA-08: P08 Arabic attachment geometry snapshot intermittent on reused dev runner (46086031725 Chromium: boundingBox null after visible check; WebKit previous timeout). Both engines have also passed the full Arabic interaction case on same source. Diagnose transient DOM replacement around composer polling, do not waive or silently retry assertions.

- QA-09: matched P12 baseline Admin reused-context Students→Messages click stayed on Students; candidate completed all three roles. Timing differences mixed. Repeat counterbalanced stage order and record pointer/API boundary evidence; do not remove baseline failure or infer product speed from incomplete/dev-only data.

- QA-09 reverse-order reproduction 46090176738: both baseline and candidate failed identical Admin fresh-context Students→Messages journey after an observed pointerdown (4.9/9.7ms rAF proxy), route stayed Students; no destination navigation request identified from sanitized API sample. Both completed Teacher/Guardian series. This does not isolate a hydration, link, handler or test cause. Investigate actual click/link/router event boundary in permitted fixture environment; do not make a visual-only behavior change or waive the failure.


- QA-08 follow-up: 46092024663 WebKit Arabic selected the intended thread, then observed GET messages HTTP 200 followed by PATCH thread read state HTTP 403 and an empty message/composer DOM. The test only injected an access-token session cookie; the existing web mutation guard requires the matching CSRF cookie/header. Conversation.tsx deliberately clears inaccessible thread content. Commit `aae6d7c15434dc2b74c4cec1ea4d970ca022202f` corrects only the synthetic test setup by signing in through the existing local web endpoint, asserts session/CSRF cookie presence without exposing values, and starts tracing after sign-in. In 46092801497 all four original chat scenarios (DE/AR on Chromium/WebKit) passed including draft retention, focus restoration, mirrored bubble corners and 44px composer targets. Fixture correction verified for this run, not proof of every messaging state or absence of intermittency. No product auth/security/permission or conversation behavior changed.

- QA-03/06 latest: 46092801497 Chromium 53/54 (cold DE install click stayed on /de; warm original P03 5/5); WebKit 52/54 (direct goto interrupted by previous AR invitation or DE preferences navigation; warm original P03 4/5, staff access interrupted by profile). Static green. Earlier signed-out production build evidence remains separate. These development-navigation failures are unresolved and not waived. Authenticated HTTPS/TLS production fixture is still unavailable; do not weaken security to pass.

- QA-05 latest: both native sizes passed normal and 200% sign-in assertions on 46090614013. Actual screenshot review discovered separate native shell large-text word fragmentation; tracked as visual P11, not a workflow bug.


- QA-03/06 root-mechanism evidence 46095641551: WebKit Arabic invite→recovery and German preferences→profile (plus warm profile→staff/access) abort exactly after Next HMR building/built and Fast Refresh full-reload with page error. New request reloads preceding route. Chromium German install click delivered to correct link, HMR building/built/done then sync reloads landing route rather than install. This establishes dev runtime interruption, not a proven production routing bug or proof of its absence. Original tests retained red, no workaround retry or routing change.
- QA-04 diagnostic 523d26c9 adds separate production-mode test-only loopback HTTPS/verified database TLS in branch-restricted disposable CI (exact container project/workdir/ports; generated short-lived CA, restricted DB login verification, unchanged secure host-only cookies). 46097129230 both TLS setup steps succeeded; actual original browser journeys still running. No school Supabase/production environment modified.

- QA-04 verified for the targeted P03 browser journeys in 46097129230: both isolated production jobs passed 5/5 with CA-verified TLSv1.3 database transport, trusted HTTPS and real secure web cookies. QA-03/06 original five journeys pass under compiled production (not live deployment); dev-only failures remain recorded red and P12 matched Admin navigation is a separate unresolved check. No real school database, security or product-routing change.

- QA-09 production diagnostic 46097747193: all three roles at both stages passed the unchanged matched action contracts on compiled production, including prior Admin navigation. 420 measurements; mixed group changes (Teacher reused More +762.27ms median, overlapping observed calendar API times). This isolates a successful production-mode run, not all dev failures or a global speed win. Counterbalanced production repeat/causal investigation open.
- QA-10 bank streamed not-found: WebKit 46097311607 observed document HTTP 200 for Guardian /school/more/bank despite unchanged original capability notFound() and parent loading boundary. Next streaming can commit 200 before terminal denial. Test-only 8bc45a90 asserts genuine localized denial, same URL, noindex, absence of protected form/heading and separate API HTTP 403 forbidden; non-streamed staff denial remains 404. Verification pending. No permission/security/product changes.

- QA-10 confirmed on both browsers in 46098654181: streamed bank document 200, generic not-found/noindex, no protected bank inputs, actual separate Guardian API 403 forbidden, no active state mutation. Existing non-streamed staff denial remains HTTP 404. Original incorrect test status assumption resolved for those cases; new visual checks red, separate from access enforcement.
