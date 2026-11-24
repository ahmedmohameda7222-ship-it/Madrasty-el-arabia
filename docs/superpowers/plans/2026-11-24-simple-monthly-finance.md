# Simple monthly finance — implementation ledger

Approved 2026-11-24: four admin entries (Finanzübersicht, Rechnungen, Zahlungen, Einstellungen), uniform monthly fee per pupil, cash default with bank optional, one invoice per pupil, combined family payment, automatic month billing, downloadable invoice and receipt PDFs for permitted actors, guardian-declared next-month pause without approval, automatic one-month return, cash ledger (income/expense/donation/bank deposit), no cash closing or sibling discount. Preserve historical financial records and role boundaries. Arabic/German mobile-first.

## Release gates
1. Navigation: merge existing screens, maintain deep links and capability guards; no inaccessible links. Move pauses to admissions. Test admin and guardian in both locales.
2. Cash default: existing receipt ledger remains authoritative; enable cash through reviewed migration, never silently record payments. Test cash/bank and duplicate idempotency.
3. Pause: atomic guardian-declared stop and existing enrollment/charge effects; preserve historical approved/rejected requests and review workflow. Test ownership, current-month fee, paid/unpaid future charge, automatic return, concurrency.
4. Documents: authorize through existing invoice/receipt read functions; private no-store PDF response, localized template and immutable issued values, receipt payer-scoped allocations. Test wrong guardian, voided/reversed payments, long Arabic names, PDF validity.
5. Recurring billing: dedicated restricted scheduler with idempotent monthly generation, no existing duplicate invoices; allow cash-first without fabricated bank details, correct skipped cases. Verify retries, tariff changes, pauses, missing payer, concurrent issue.
6. Cashbook: derive cash receipts/refunds from source ledger, append-only other cash movements; bank deposit is transfer not expense. Audit, export, permissions, balance continuity. No closing.
7. Verify full web/Android builds, domain acceptance, browser regressions, migrations in isolated DB, preview before production. No financial production migration before passing.

## Status
Implementation in progress on this branch. Do not equate a committed UI change with release of the financial workflow.
