# Finance mobile UX redesign
Approved direction: native-inspired, simple Arabic and German, mobile-first. Preserve all financial semantics, permissions, API calls, invoice PDFs, automatic billing, cash-first defaults and guardian-declared pauses.

## Work sequence
1. Separate finance layout from authentication cards; use existing theme tokens, logical CSS, 44px controls and grouped rows. Verify at 320/390/430/1280px, light/dark, Arabic/German.
2. Put the current cash balance and primary payment action first; keep detailed reports and advanced filters in disclosures. Do not hide alerts or permission-sensitive actions.
3. Make invoice and payment lists readable rows, with amount, name/date/status, and secondary details on selection. Keep payment confirmation and invoice allocation logic unchanged.
4. Cashbook: balance, incoming/outgoing totals, add movement, history; disclose secondary metrics. Settings: group automatic billing, fees and payer assignment; no backend changes.
5. Android: review Compose screens and align hierarchy, grouped lists and Material 3 controls while preserving state and navigation.
6. Verify existing finance and guided-workflow tests, build/typecheck, Android build, and authenticated before/after screenshots for admin/guardian in AR/DE; include long names, empty/loading/error and dark mode. No merge until checks and visual review pass.

## Review focus
Permission-dependent actions; payer isolation; currency/negative balances; cash vs bank; partial allocations; report cutoff semantics; accessible focus and RTL; PDF download; no accidental changes to financial data. Existing date hints remain available and accessible. If runtime cannot be executed, keep PR draft and label evidence unverified.
