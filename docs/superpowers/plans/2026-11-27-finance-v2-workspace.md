# Finance V2 implementation plan
Approved reference: Madrasty_Buchhaltung_Prototype_V2.html (2026-11-27).
Keep live ledger, capability checks, CSRF, revision/idempotency and payer visibility. No demo data or simulated writes in production.
- [ ] P0: one-screen invoice creation: single pupil default, explicit class/school scope, inline eligibility/count, direct issue, inline payer repair, same draft, clear messages and retry.
- [ ] P0: integrity: cash availability, duplicate bank references, same-payer allocations, cancellation and reissue, receipt-linked actual refunds; distinguish accounting void from cash refund. Test API transactions and concurrency.
- [ ] P1: shared finance navigation, invoice search/filter preservation, direct payment, return to list, one-step cash and fee settings; maintain permission gates.
- [ ] P2: unified searchable ledger, export limits, optional bank security/MFA, parent view and pause.
- [ ] P3: native parity; German/Arabic, responsive, keyboard and accessibility. End-to-end user journey from unconfigured payer to issue and payment, invalid and retry states; CI, squash merge and live verification.
Decision: retain server preview/confirmation protocol (validation and concurrency) behind one visible form; bulk scope/count visible before commit; never silently issue more than shown. Existing API contracts are not replaced with the prototype's local data. Only server-confirmed successes displayed.
