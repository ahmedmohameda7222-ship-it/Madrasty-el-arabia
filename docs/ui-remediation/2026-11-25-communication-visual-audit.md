# Communication visual audit — 25 November 2026

Baseline: main 68311fca34ab628fa0e5eae3c7a33c0dd0098b06; CI 45559510363, artifact 14997671748. Visually inspected all 22 baseline PNGs, not just page-overflow assertions.

| Finding | Evidence | Change |
|---|---|---|
| Arabic weekday names break into individual characters | All three AR calendar screenshots | Compact weekday labels, full localized accessible names, no word breaking |
| Calendar starts too low for admin/teacher; cramped circles | Calendar AR 320, DE 390 | Compact management/class controls; flatter seven-column grid, distinct today/selected/event markers |
| German feed filters split words | All DE feed screenshots | Smaller scoped type, single-line filter labels |
| Long names create six-line chat rows | Teacher AR 320, DE 390 | Two-line list truncation, compact metadata, full accessible name and full detail |
| Chat search placeholder cuts mid-word | DE inbox 320/390 | Short visible hint, full accessible label |
| Previous screenshots mostly empty; editor states absent | 22 screenshots | Populated role/locale matrix, 320/390/430px, light/dark system appearance, scroll captures and manifest |

No new permissions, migrations, or API changes. Android native code unchanged: the requested Playwright audit is the web/PWA surface. At 320px seven 44px-wide cells plus gutters cannot fit; the calendar keeps at least 44px height and checks all seven cells remain inside the content. A 390px device has more room. Existing calendar access and event management retained. Do not merge based solely on green CI: download the exact-head screenshot artifact, inspect contact sheets and manifest, and fix any remaining defects before final verification.

Audit coverage is resilient by screen group: one failed interaction records its screenshot and diagnostic without preventing the remaining independent surfaces from being captured. Covers current viewport and scrolled state; includes reaction picker, reply, synthetic photo preview, bilingual publication previews, next month, unread notices and assigned moderation only when authorized. Full Arabic weekday words omit only the definite article. Admin sender history and teacher-authored class draft are seeded according to existing permission model, not widened. Additional compact broadcast and notification controls use the existing accessible names.
