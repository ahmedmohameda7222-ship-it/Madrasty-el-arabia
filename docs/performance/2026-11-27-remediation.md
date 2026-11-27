# Performance remediation checkpoint

Baseline: ce6e948b5e2cf29a2fadf27e17a7b400fc68beb2. Scope: retain behavior, authorization, Arabic/German presentation and native Android contract.

Implemented on the isolated performance branch:
- P0.1: API-level Server-Timing for elapsed handler time, authentication and DB transaction spans/counts. Spans overlap (auth includes DB); not additive. No paths, tokens or records are in the headers.
- P0.2: batch multi-capability checks across 13 pages; Students uses one school menu capability check; retain all API authorization, role and MFA guards. Common DB role/actor transaction setup itself is unchanged.
- P0.3: static school segment loading boundary preserves authenticated shell and allows partial route prefetching; existing nav feedback remains.
- P0.4: in-flight GET coalescing for shared initial read hooks by account/session/persona/path/schema; independent cancellation, invalidation around writes. No resolved-response cache, no public caching or persisted student data.
- P0.5: batched dashboard counts with individual savepoint fallback; preserve unavailable vs zero.
- P1.2: batched substitute assignment reads instead of N+1.
- QA: unit/static regressions and isolated API/browser timing samples in GitHub Actions. Timing test environment is dev-mode synthetic QA; not deployed production measurements.

Remaining before performance audit closure: obtain CI results; profile production cold/warm navigation on authenticated devices; compare before/after API and Web Vitals; review route-specific waterfalls, completed-response caching and invalidation design, polling, finance plans and targeted indexes, attendance and import bulk writes, timetable conflict algorithm, large component render profiling, bundle splitting, all page/action coverage and native Android behavior. Do not waive authentication/CSRF/RLS checks or assert targets are met without measurements.

## CI investigation
First run 45928280860: all 10 performance unit/static checks, TypeScript, build, 100 domain checks, and 54 API samples passed. Browser run failed 7/10; WebKit log explicitly identifies Next dev overlay intercepting nav clicks. The retry uses the existing QA-only dev indicator setting, isolated browser matrix runners, bounded click/request waits and failure diagnostics. No forced clicks or suppressed runtime errors. Browser tests still assert destination and terminal state; evidence files include incomplete samples on failures. Production metrics remain unverified.
