# Communication Center Implementation Plan

> Use Superpowers executing-plans, TDD, verification-before-completion and finishing-a-development-branch. This is an execution checkpoint, not a completed release.

**Goal:** One simple communication experience on Web/PWA and native Android, with direct messaging between all active school personas.

**Architecture:** Keep existing private direct threads, idempotent commands, notification, publication, calendar and moderation APIs. Unify entry points and simplify presentation; preserve contextual office-case data and its existing authorization until migration compatibility is proven. Changes to the directory and direct-chat relationship must be scoped to those features, not teaching, student, finance, or publication permissions.

**Baseline:** main 4471a181ea3cc735fa395cdef8a295743f5f462b (admin start redesign). Branch feat/communication-center-2026-11-25.

## Global constraints
- Three roles only: Admin, Lehrkraft, Eltern. All active accounts may start direct messages to all other active accounts. No class relationship restriction for ordinary direct chats; no self-chat; no outsider access. Keep guardian personal email/phone hidden and do not expose other children's records.
- My contacts prioritizes assigned teachers and administration; All persons offers all three role groups. Admin job title visible. Ordinary compose is person-to-person, no ticket/Anfrage workflow.
- Preserve school-specific publication targeting, mandatory bilingual broadcast preview and confirmation, private thread participants, moderation capabilities, media and legacy contextual references. Keep existing data and old links working.
- Simple Arabic RTL and German LTR; dark/light; mobile-first, safe areas, keyboard, native Android, accessible controls; no regressions in finance/admin start.
- No production migration or merge until isolated tests pass; Vercel production follows main only.

## Work sequence
- [x] Direct permission RED: qa/communication/open-directory.test.ts (failure confirmed in run 45544614207). Verify against disposable QA with pnpm qa:communication. Check limit contract and pre-existing directory restriction tests; update only intentional changed behavior.
- [x] Direct permission GREEN (initial migration acceptance at d18f0e5; later changes require retest): new Supabase migration based on live app.directory_contacts(), staff_contact_candidates(), directory_relationship_allowed(), contact_account_active(). Use active account/persona predicates, preserve contextual authorization and participant-only read. Test each role pair, inactive/self targets, duplicate pair reuse, outsider 404, no guardian private details, cross-class data denial. Do not apply on live DB yet.
- [ ] Directory & compose: apps/web/src/server/identity/directory.ts, ContactDirectory and StartConversation; add My contacts/All persons, search, group roles, title, direct route. Keep pagination and stable contact keys; Android equivalent. Test role access, results beyond first page, no empty threads where possible.
- [ ] Chats: ThreadInbox/Conversation in Web and Android; clear new message affordance, compact search/filters, archive, sticky composer, retry/idempotency, read state; ordinary threads do not show case-management controls. Preserve contextual existing office data. Test retry/offline, keyboard/RTL, privacy.
- [ ] Aktuelles: consolidate announcements/news/events entry and creation choices. Keep broadcast preview/recipient counts/confirmation, news/event drafts, published visibility, optional translations and publish revision. Test audience boundaries, no duplicate delivery, invalid event date, empty states and drafts.
- [ ] Kalender: unified presentation of published events and academic dates; separate school-day editing with existing capability. Verify all-day dates, pagination/month changes, class filters, no attendance side effects from events.
- [ ] Navigation/notifications: simplify communication entry to Chats/Aktuelles/Kalender; direct single-target deep links and existing multi-target chooser, preserve legacy routes and moderation visibility, coordinated unread badges; test all personas.
- [ ] Native polish: reuse icon system, no decorative clutter; Arabic/German, light/dark, touch targets, reduced motion, safe areas, keyboard and long text. WebKit mobile screenshots and Android emulator screenshots.
- [ ] Full QA: pnpm check:types, pnpm build:web, pnpm qa:communication and other domain suites, web browser tests, Android unit/build and visual tests, migration replay and security review. Record evidence, failures, exact commit.
- [ ] Release: ready PR only after verified checks; squash merge; confirm main SHA, authorized Supabase migration ledger, Vercel READY for exact commit and production smoke. Never claim complete without evidence.

## Initial verification
- GitHub main confirmed; previous admin start merged. Existing finance PR #15 is separate and untouched.
- Supabase project ycsyghyigkadtugluugm is healthy; read-only function inspection confirms old class-based restrictions. No production SQL writes.
- Vercel linked project madrasty-el-arabia-prelaunch found on correct account. No deployment triggered manually.
- Supericons queried; reject irrelevant suggested icons and use coherent existing outline icon library.
- Designer preflight connector unavailable. No actual device screenshots yet.

## Execution ledger
- Read-only RED evidence: current live policy returned 0/306 allowed guardian-to-guardian pairs and 0/42 teacher-to-teacher pairs; 108/126 allowed in each guardian/teacher direction. No live writes. Isolated full acceptance run 45544614207 still running at implementation checkpoint; Web build, dashboard-integration and Android debug passed at 15d1d77, not a GREEN result for new code.
- Ruling: admin with active grant but no staff profile remains a contact; the existing principal account has no staff profile. Show a safe fallback name, never email or guessed identity. Profiled but disabled admins remain excluded. Real names/job titles remain the staff profile's data. Costs: unprofiled admins have generic labels until an actual profile exists; expanded contact eligibility also allows existing notification eligibility checks to recognize those valid admin accounts.
- Ruling: preserve older office descriptors for installed clients and protected record-origin links; ordinary new compose will only display people. Work emails/phones keep old visibility boundary.
- Ruling: migration filename selected in chronological repo convention through GitHub (local Supabase CLI unavailable). Preserve the baseline CI run instead of auto-cancelling it while implementation proceeds.

## Implementation checkpoint (2026-11-25)
- Initial role matrix migration passed full CI run 45545080205. Later code has not inherited that proof.
- Web/native contact picker, role filtering, search and paging, unified hub/feed/calendar, direct notice links, mark-all read, chat UI and composer controls, explicit broadcast audience/language controls and date conversions are implemented on this branch. Latest first-text compose uses one transaction and read-only lookup; media still requires a hidden empty thread for upload authorization. Old clients/context routes remain compatible.
- Run 45546946642: web build, dashboard integration and Android debug passed; WebKit failed due to missing fixture seed and German mobile fold (461px vs 450px). Both fixes committed; new run required. Domain acceptance still pending at last check. Earlier operation-count and calendar field assertions corrected; no final acceptance proof yet.
- Remaining: latest-head CI and visual review, atomic compose and mark-all verification, native scroll/reaction polish, publication draft/management usability and remaining acceptance matrix, security and migration review, squash merge, production migration, Vercel deployment and smoke. No production write or merge.
