# Profile Implementation Plan
> Use superpowers test-driven-development and verification-before-completion.
1. Add policy regression: profile identity, persistence, stale revision and cross-family/teacher rejection.
2. Implement migration, profile contracts and authenticated GET/PATCH; verify protected SQL functions and no sensitive command receipt payload.
3. Add bilingual web and native Profile navigation, editor, greeting and emergency detail visibility; reuse existing UI components.
4. Update operation-count contract and retired-transfer test (test only enrollment history; no audit route). Run full CI and squash merge only with fresh successful required jobs.
