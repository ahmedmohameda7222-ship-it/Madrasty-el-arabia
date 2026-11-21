# Screenshot retry diagnosis — 21 November 2026

Source run: https://github.com/ahmedmohameda7222-ship-it/Madrasty-el-arabia/actions/runs/44885864968

This diagnosis compares the four saved retry artifacts with the original screenshot
manifests from runs 44878617957 and 44881108800. No successful page was recaptured
for this analysis; the artifacts were reclassified locally.

| Job | Attempts | Captured | Previously evidenced 403/404 | Unresolved |
|---|---:|---:|---:|---:|
| admin-de | 15 | 14 | 1 | 0 |
| teacher-de | 63 | 30 | 33 | 0 |
| guardian-de | 32 | 15 | 17 | 0 |
| guardian-ar | 2 | 2 | 0 | 0 |
| **Total** | **112** | **61** | **51** | **0** |

The 112 attempts include 108 prior navigation failures and 4 targeted mobile
regressions. All 108 have a recorded response in this retry. 51 responses are
HTTP 404, **not** 51 screenshots and **not** successfully rendered pages.

Every retried 404 was already a 404 for the same persona and route
in at least one previous viewport or Arabic/German locale. Web route handlers
explicitly return Next.js `notFound()` for missing persona capabilities.
Example: `apps/web/src/app/[locale]/school/more/message-reports/page.tsx`
returns 404 unless `mayManageMessageReports(session)` succeeds.

The prior strict-retry classification wrongly failed these recognized denials.
The updated policy allows documented denials for the **same persona** as
`denied` only; it still fails unknown 404, missing screenshot, HTTP 5xx and
connection errors. The original manifests and all four new artifacts remain
available in GitHub Actions. Screenshot retry is manual-only to avoid rerunning
the expensive prior capture when uploading verification-only code changes.

A denied route is excluded from successful visual coverage. This does not
constitute a full permissions, functional, or production QA pass.
The four 390px guardian homework/exam capture checks passed the viewport
overflow assertion; the synthetic fixture child display names still contain
technical run IDs that should not be used to assess real production names.
