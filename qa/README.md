# Final QA

Run commands from the repository root with Docker Desktop, the pinned Node and pnpm, Supabase CLI, Microsoft Edge, PowerShell 7 and the Android toolchain in [environment.md](../docs/execution/environment.md).

1. Install with `pnpm install --frozen-lockfile` and `pnpm exec playwright install firefox webkit`.
2. Start the isolated Supabase stack with `pwsh -File qa/start-stack.ps1`. The stack is `madrasty_final_qa` and binds Auth to port 55421 and PostgreSQL to 55422. It has no production project link.
3. In a separate terminal run `pwsh -File qa/local.ps1 -Serve` for the web/API at `http://127.0.0.1:4300`.
4. Run `pnpm qa:all` or one of the suite commands in [the plan](../docs/superpowers/plans/2026-11-19-08-final-qa.md). Start a clean run by stopping the local web server, running `pwsh -File qa/start-stack.ps1 -Fresh`, then starting the local server again. The reset is restricted to the tagged local stack and clears its synthetic state.

The acceptance scenario uses 2026-11-21 as the school day. Update the scenario dates together when exercising the current-day substitute or future billing rules on a later school day.

The QA stack uses a restricted SQL fixture login and an independent runtime login. Test accounts have namespaced synthetic addresses under `madrasty.invalid`. The local application allows only those addresses and has no external mail or push credentials. Test bindings and fixture TOTP keys stay in git-ignored files. The fixture collision test removes only the unused tagged run. The operating site receives only read-only API, installation-page and APK checks.

The Android command checks the signed public download and runs Kotlin JVM wire tests with the debug build. Browser viewports run in Edge, Firefox and WebKit. The PostgreSQL drill restores a logical snapshot into a disposable database beside the local source and compares sanitized counts and totals. The evidence report records delivery, physical installation, private media recovery and other cases that need separate runs.

The recovery email test runs at the end of `qa:all`. It changes one synthetic account password through the school's bilingual template and the local Mailpit inbox. Start a fresh fixture run before repeating the full suite.

For the independent private media drill, start `pwsh -File qa/ops/start-media-restore.ps1` and run `pnpm qa:restore-media` with the main QA stack online. The destination is a second loopback Supabase instance on port 56421. The test compares the restored object's SHA-256 and anonymous access.

For the rollback drill, keep the current local QA web application running, start `pwsh -File qa/local.ps1 -Serve -PreviousRelease` and run `pnpm qa:rollback`. Both versions use the same isolated QA database with outbound providers disabled. The previous release listens on port 4310. The rehearsal switches a local proxy and checks a guardian's existing session and child access.
