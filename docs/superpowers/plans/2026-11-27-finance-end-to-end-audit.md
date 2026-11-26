# Finance end-to-end remediation — 2026-11-27

Approved direction: retain existing immutable financial ledger, cash-first payment, one monthly fee per pupil, Arabic/German mobile-first, four finance entries. No production test payments, account creation, link reassignment, or notification replay.

Base: 9c2fa9ac2495650e13fedbd1a3aad58ebb036af5.

## Evidence at start (read-only production queries)
- 39 students; 50 invoices (29 paid, 7 partial, 14 unpaid), 42 receipts; 0 duplicate monthly invoices, line sum discrepancies or overallocations.
- 37 current billing-eligible pupils, 36 current invoices; one missing payer designation.
- 37 effective payer designations, 36 linked to app-active accounts without corresponding Auth identities (counts are designations, not unique people). One allocation event was projected without notice because the recipient had no Auth identity. Existing 18 old invoice notices, 5 read; no linked delivery jobs. No automatic invoices/reminders at audit time. Do not treat imported records as proof of new delivery failure.
- Worker schedule exists; cron success alone does not establish delivery.

## Implementation ledger
- [x] Branch created from current main; committed browser regressions for settled invoice action, manually entered received amount, and combined open invoice list.
- [x] Web and Android guard the operator-entered amount against subsequent invoice selection; web warns when allocated amount exceeds amount received.
- [x] Web invoice action requires positive outstanding balance; Android already did.
- [x] API query state=open combines unpaid and partial before cursor pagination; web and Android receipt pickers use it. Returned invoice state enum unchanged. OpenAPI parameter documented.
- [x] Read-only scoped billing health migration + server contract + German/Arabic Web/Android disclosure list. It reports missing current payer or a current assigned payer that cannot receive communications. No security gate relaxed; no Auth changes. Existing historical receipt visibility and delivery behavior unchanged.
- [x] Add finance, Android, Chromium and WebKit CI branch triggers; regression assertions committed before corresponding code.
- [ ] Verify real RED/GREEN browser, API and Android test output; local git clone unavailable (DNS), so no local end-to-end execution. CI results must be inspected.
- [ ] P0: diagnose origin of app-only accounts and use authorized activation/invitation workflow; confirm account ownership. Add safe notification catch-up policy, delivery evidence and retries. Do not replay old events indiscriminately.
- [ ] P0: verify automatic issue and reminders using isolated fixtures, recipient authorization, cross-family PDF/API denial, concurrent/idempotent receipts, actual test inbox/provider evidence.
- [ ] P1: streamline family-first payment selection and confirmation; review cashbook reversals, report reconciliation and export limits; test real iPhone/Android safe areas, keyboard and accessibility.
- [ ] P2: consolidate settings and reporting UI, simplify translations, unify buttons/fields, remove duplicate CSS, improve searchable/accessibility-friendly PDFs.

Ruling: preserve existing authorization and accounting semantics; address inability to receive communications by reporting readiness, not bypassing Auth or fabricating users. Payer readiness is current-period, not a delivery receipt or a historical replay mechanism.
Ruling: use branch-scoped CI as local container cannot resolve github.com. Source checks are not runtime tests. Keep draft until tests and migration deployment sequencing are validated.

## Continuation — second implementation batch
- [x] Read-only account-origin investigation: 19 active linked guardian accounts, 18 without matching Auth identities; the 18 use reserved test email domains. The 36 unreachable pupil designations are not 36 separate people. Readiness query returns 1 missing payer and 36 unreachable pupils. No activation or historical replay attempted. Real account creation still follows the existing verified invitation path.
- [x] Added synthetic API regression covering a named payer receiving exactly one invoice notice and one payment notice, nonpayer isolation, and dispatcher replay deduplication.
- [x] Current payer selected by effective month/revision, with explicit selection when there is no eligible current choice; remount on student link change; Web and Android.
- [x] Monthly fee configuration and automation share one tab; payer editor is separate. Added structure regression.
- [x] Search invoices by payer name without bypassing invoice visibility; display payer in both native and web pickers; add negative cross-family API regression.
- [x] Keep suggested received amount synchronized with editing/removing invoice allocations; preserve any manually entered received amount. Added browser assertions.
- [x] Retain historical automatic billing start on toggle; reject different past dates. Added migration, local-only fixture and regression; Web and Android UI retain stored value.
- [x] Capability-gated payer readiness counter and settings link on Web/Android overview.
- [ ] Runtime verification: GitHub connector reports no combined statuses and no PR-triggered workflow runs, which does not establish whether push-triggered CI passed. Local git ls-remote failed DNS. Nine source-level checks passed; no claim of runtime RED/GREEN or full build.
- [ ] Remaining: finance email/push acceptance evidence in isolated provider/inbox, full API matrix, family-first selection by stable family identity, cashbook corrections, visual device validation, PDF improvements, final review and squash merge.

Ruling: do not activate test-domain accounts or retrospectively send notifications to them. Name search is not a family identity match; never automatically group or allocate by a display name. Historical billing dates are retained only if identical to the stored date.
