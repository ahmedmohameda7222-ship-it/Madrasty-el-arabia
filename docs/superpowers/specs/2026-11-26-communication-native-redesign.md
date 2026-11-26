# Communication Native UX — approved direction (2026-11-26)

Redesign Kontakt / التواصل as a mobile-first communication workspace, not a collection of administrative forms. Preserve the three destinations Chats, Aktuelles, Kalender; account/persona boundaries; authorized directory, office cases, messages, publication and calendar APIs; the recently merged language-state behavior. No production data changes or permission expansion.

iOS web/PWA: compact navigation, system typography, flat lists, 44 CSS-pixel minimum touch targets, accessible actions and safe-area layout. Android Compose: Material 3 navigation, lazy lists, search, 48dp touch targets, system back and IME handling. Web platform styles are presentation only, not a claim of Swift native implementation. Retain desktop responsiveness, Arabic RTL, German, dark mode and reduced motion. Do not copy third-party branding.

Use the existing synthetic QA environment. Keep real send/retry/read/attachment behavior. Additional backend features (pin, mute, realtime, shared media) require capability/contract review; do not expose nonfunctional controls. Do not store private message drafts in browser persistent storage. Do not merge until applicable exact-head checks and visual inspection pass.
