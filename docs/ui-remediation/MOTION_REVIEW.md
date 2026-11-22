# UIX motion review — Emil skill standards

Sources: `emilkowalski/skills/skills/mobile-native/SKILL.md`, `emil-design-eng/SKILL.md`, `review-animations/SKILL.md` and `STANDARDS.md`, `break-ui`, `animate`, `choreograph`, `apple-design`. Review is code + isolated Chromium, **not** hardware feel or external reviewer sign-off.

| Before | After | Why (and evidence) |
| --- | --- | --- |
| Shared buttons lacked consistent pointer-down feedback | `:active { transform:scale(.97) }` and `transition: transform 120ms var(--ease-out), background-color 120ms ease` on eligible controls | 120ms fits Emil 100–160ms press budget; browser press/focus/reduced-motion regression GREEN |
| Mobile hover could stick or synthesize pointer hover | Relevant hover styles only in `@media (hover:hover) and (pointer:fine)` | Platform capability rather than user-agent device guessing; real touch remains unverified |
| More rows replayed entry-only `@keyframes more-enter` on each expansion | Rows appear immediately. Only disclosure arrow rotates via **140ms** `var(--ease-out)` transition; `reduce` disables movement | Rapidly repeated disclosure should be interruptible, not replay keyframes; repeated keyboard and click tests GREEN |
| More arrow used weaker CSS default `ease-out` | Shared `cubic-bezier(0.23,1,0.32,1)` `--ease-out` | Strong existing curve prescribed by Emil's standards; computed-style RED→GREEN |
| Native scope dialog was assumed to need decorative sheet motion | Existing `<dialog>` modal preserved with focus/ESC/selection/backdrop; no motion added | Existing interaction already passes; no animation for its own sake |
| Loading skeleton animates `pulse` | Pulse remains gated by `prefers-reduced-motion:no-preference` | A status indication rather than decorative page-entry choreography |
| Long names and German bottom-nav text could force wrap/overflow | Realistic long-name fixtures; mobile `Anwes.` / `Nachr.` with full accessible labels and desktop original labels | Break-UI adversarial data, not an arbitrary rebrand; 320px focused tests GREEN |
| Safe areas/native shell could be unintentionally redesigned | `100dvh`, `viewportFit:cover`, `env(safe-area-inset-*)`, 44px touch, RTL/LTR and Android Compose retained | Platform semantics; source/browser verification only |

**Negative test findings:** no new motion library; no `transition:all`, `scale(0)`, extra child stagger, keyboard-triggered entrance keyframe or routine movement >300ms; disabled movement for reduced motion. Code-level negative tests in `qa/web/ui-motion-contract.spec.ts`, run 45034346415.

**Qualitative follow-ups:** Physical iOS rubber banding, mobile Safari browser chrome and keyboard, Android IME/APK, actual touch feel and safe areas remain NEEDS_DEVICE. Guardian desktop child shortcuts remain crowded and need deliberate owner review. Native date widget display order remains browser-specific; hints are accessible. Do not add new ornamental dashboard animations or gesture libraries without a demonstrated defect.
