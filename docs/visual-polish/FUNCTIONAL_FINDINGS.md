# Functional and QA findings

These observations are recorded separately from visual polish. File paths are repository-relative and evidence directories are local.

| ID | Observed behavior | Evidence | Next verification |
| --- | --- | --- | --- |
| QA-01 | The two Teacher cases in the older UI acceptance matrix wait for a browser response with HTTP 503. The configured local school instead rendered the attendance form with the empty state and the wait reached its original 120-second timeout. | `qa/web/ui-acceptance-matrix.spec.ts`, browser traces and error contexts under `qa-artifacts/ui-remediation-test-results/`. | Reproduce against the pinned product commit in a clean synthetic school and distinguish unconfigured service failure from a configured empty day. |
| QA-02 | Calendar and Admin oversight tests stopped before visual assertions with HTTP 409 `stale_revision`. The existing shared fixture PATCH sends revision 0 and the reusable local QA database had earlier school settings. | `qa/fixtures/calendar.ts`, `qa/web/ui-calendar-preview.spec.ts`, `qa/web/ui-admin-oversight.spec.ts`, local error contexts. | Run in a fresh disposable school for primary evidence. Check the fixture initialization contract separately from the UI. |
| OBS-01 | One immediate click of the settings action after a cold Next development reload did not open the dialog. It worked after the screen became interactive. | Live Edge 390 px, app running through the QA development server. | Verify on a production build under cold and warm cache in the P12 responsiveness pass. |

The local suite results above do not establish product regressions. App behavior and existing assertions were preserved.
