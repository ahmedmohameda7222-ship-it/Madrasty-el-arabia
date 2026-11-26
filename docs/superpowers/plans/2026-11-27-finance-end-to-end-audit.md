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
