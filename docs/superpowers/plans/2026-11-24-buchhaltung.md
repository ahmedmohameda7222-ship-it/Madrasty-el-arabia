# Simplified Buchhaltung implementation
Approved 2026-11-24: four finance entries (Finanzübersicht, Rechnungen, Zahlungen, Einstellungen); same price per child; full months only; cash default, bank optional; one invoice per student, multi-invoice receipts; PDF invoice/payment confirmation; automatic monthly issuance; guardian pause without approval, next month; cash book income/expense/bank transfer, no closing count.
Preserve role checks, tenant scoping, immutable ledger and legacy routes. Do not activate automated billing until duplicate protection, timezone, paused enrollment and missing payer/tariff tests pass.
- [ ] Navigation consolidation and payment default, preserve existing routes and review access.
- [ ] Secure server-generated invoice/receipt PDFs with Unicode, actual issuer data, historical records and guardian-scoped receipt amounts.
- [ ] Guardian immediate pause transaction with ledger side effects and historical compatibility; automatic resume after one month; review old payments.
- [ ] Monthly billing job, idempotency, notifications and configuration; no historical backfill by default.
- [ ] Cashbook ledger, reversals, opening balance, receipt-derived income, cash refunds, transfer not expense, reporting.
- [ ] Android parity and regression tests; deploy migration before dependent code; verify build and authenticated browser.
