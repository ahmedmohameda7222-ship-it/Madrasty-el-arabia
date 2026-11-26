# Communication Native Redesign Implementation Plan

> For agentic workers: use superpowers:executing-plans, systematic-debugging, test-driven-development and verification-before-completion. Track evidence before marking tasks complete.

**Goal:** Deliver a professional mobile-first communication center in the actual app.
**Architecture:** Keep existing contracts, persona scopes and APIs; replace screen-level presentation in web and Android. Reuse shared account settings, responsive shell and server authorization.
**Tech stack:** Next.js/React/CSS, Kotlin/Jetpack Compose/Material 3, Playwright and synthetic Supabase QA.
**Spec:** docs/superpowers/specs/2026-11-26-communication-native-redesign.md

## Global constraints
- Preserve authorized actions and routes including deep links and list search/filter context.
- Preserve language switch without page reload, sign-out or draft loss.
- Arabic RTL and German; dark mode; reduced motion; safe areas; iOS 44px and Android 48dp target sizing.
- No production database changes, widening permissions, fake controls or persistent sensitive draft text.
- Each task: add regression, verify RED, implement, verify GREEN, commit. Merge only with exact-head checks and reviewed captures.

## Tasks
- [ ] 1. Inbox hierarchy: modify CommunicationHub.tsx, ThreadInbox.tsx and school.css; single Kontakt title, compact compose action with existing accessible name, debounced search without redundant submit, flat conversation rows. Test real guardian inbox, 320/390/430 viewport, search/filters and long names.
- [ ] 2. Chat viewport: modify Shell.tsx, ThreadInbox.tsx, Conversation.tsx, school.css. Dedicated screen with one scrolling timeline, fixed composer and accessible settings; hide redundant navigation in mobile thread without removing back navigation or language settings. Assert keyboard/composer reachability and unchanged thread identity.
- [ ] 3. Directory/first message: ContactDirectory.tsx, StartConversation.tsx, MediaComposer.tsx; unify layout, authorized office targets, existing/new conversation flow, attachments and text; preserve retry identifier. Test permission-restricted targets and first-send idempotency.
- [ ] 4. Message interaction: Conversation.tsx and Conversation.kt; date grouping, compact menu, accessible reply/reaction/report, new-message jump, scroll anchoring. Test long history and failed send.
- [ ] 5. Android: ThreadInbox.kt, Conversation.kt, SchoolWorkspace.kt, SchoolShell.kt; Material app bar, lazy inbox, state restoration, 48dp touch targets, IME/system-back, role-specific route. Add real Compose regression and visual cases.
- [ ] 6. Feed and standalone primary calendar: CommunicationHub.tsx, SchoolPublishing.tsx, CommunicationFeed.kt, SchoolPublishing.kt; uncluttered publication list and calendar/agenda, preserve date/class filters and permission-gated management.
- [ ] 7. Contact info and draft continuity: audit existing contracts; expose only supported actions, keep drafts session-local per account/persona/thread; explicitly defer unsupported pin/mute/realtime/shared-media features unless implemented and tested with authorization.
- [ ] 8. Verification: full web/Android builds, domain acceptance, communication regression, language regression, 3 personas x 2 languages x 3 mobile sizes, light/dark, keyboard and desktop. Inspect actual artifacts and report remaining risks.

## Review focus
Long names and mixed direction text; deep-link/back restoration; keyboard and nested scrolling; reconnect/retry/duplicate sends; unauthorized contact or publication exposure; account/role switch clears private state.

## Calendar amendment (user approved)
- Move event calendar to /school/calendar on web and SchoolTab.Calendar on Android. Kontakt contains only Chats and Aktuelles. Keep calendar administration /school/more/calendar separate. Old /school/messages?section=calendar and /school/more/events deep links redirect to standalone calendar retaining query context; event detail returns to calendar, not Kontakt. Five navigation destinations where the role permits the existing second tab. Test all three personas and languages, old link, selected tab and detail return. Do not remove any event functionality.

## Progress
Baseline main e7d820c0392f5cd19ad501c91f3b3a43ab6ec713. Existing prior communication and language CI evidence; no current-branch results yet. Remote isolated branch used because no local checkout is attached. Designer preflight connector unavailable; do not claim independent visual review until actual artifacts inspected.

2026-11-26 checkpoint: implemented initial web inbox simplification and standalone calendar routing on web/Compose at a7a1b7f; web build passed, remaining CI pending. Updated obsolete search-button regression to verify debounced API/query behavior. Chat viewport regression added before dedicated layout change. No task marked complete until exact-head CI.
