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
