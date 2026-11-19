# Build and environment bindings

## Toolchain

| Tool | Pinned version or floor |
|---|---|
| Node / pnpm | 24.20.0 / 11.25.0. Vercel selects the Node 24 runtime family. |
| Next / React / TypeScript | 16.4.6 / 19.3.1 / 5.9.3 |
| Java / Gradle / AGP | Temurin 17.0.21+9 on the build machine / Gradle wrapper 9.4.1 / AGP 9.2.1 |
| Kotlin and Compose | Kotlin 2.3.21 with AGP's built-in Kotlin / Compose BOM 2026.09.00 / Activity Compose 1.13.0 |
| Android | SDK platform 37.0 revision 2, compile and target API 37, AGP build tools 36.0.0, device minimum API 26 (Android 8.0) |
| Web | Safari and installed home-screen web on iOS 16.4+, current desktop Safari, Chromium and Firefox. Final browser/device evidence belongs to Q06. |

[Next.js setup](https://nextjs.org/docs/app/getting-started/installation) · [pnpm compatibility](https://pnpm.io/installation#compatibility) · [AGP compatibility](https://developer.android.com/build/releases/agp-9-2-0-release-notes) · [Android 17 SDK](https://developer.android.com/about/versions/17/setup-sdk) · [Gradle checksums](https://gradle.org/release-checksums/) · [Compose BOM](https://developer.android.com/develop/ui/compose/bom)

## Build from the repository root

1. Install the pinned Node and pnpm toolchain, then run `pnpm install --frozen-lockfile`.
2. Run `pnpm check:types` or `pnpm build:web`. Next generates `apps/web/.next`. Vercel uses the monorepo workspace with `apps/web` as its project root.
3. Set `JAVA_HOME` to JDK 17 and `ANDROID_HOME` to an SDK with the platform and build tools above. Locally on Windows these are under `%LOCALAPPDATA%\MadrastyBuild` in `jdk-17.0.21+9` and `sdk`. The repository's checked-in wrapper verifies the Gradle distribution SHA-256.
4. Run `pnpm build:android` for `apps/android/app/build/outputs/apk/debug/app-debug.apk`. The same wrapper entry point runs `apps/android/gradlew.bat :app:assembleDebug` on Windows (`-p apps/android` if called from the repository root), or `./gradlew :app:assembleDebug` from `apps/android` on Linux. `pnpm build:android release` uses the release variant, unsigned until D04 supplies release signing.

The Android Java namespace is `de.madrasty.app`. The provisional local application ID is `de.madrasty.app.prelaunch`; set `ORG_GRADLE_PROJECT_madrasty.applicationId` once D04 binds the school-owned package identity. Keep that binding stable for signed updates. Local web origin is `http://localhost:3000`. School HTTPS origin, verified Android App Links and APK signing custody bind in D03/D04.

## Hosting inventory

- Project ref `ycsyghyigkadtugluugm` is accessible through the school Supabase connector, healthy in `eu-west-1`, PostgreSQL 17.12. Read-only inventory listed zero tables in `app` and `public` and zero branches. D02 must establish data classification and deployment authority before a remote migration.
- Repo-URL lookup returned zero Vercel projects on both connected accounts. D03 owns final account/team selection, environment binding, delivery providers and deployable public origin.
- Staging uses synthetic records and controlled recipients. Provider credentials, database credentials and signing material live in the appropriate secret stores.

| Variable | Purpose / scope |
|---|---|
| `APP_ORIGIN` | Server-side canonical origin for redirect and cookie-write origin validation. |
| `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` | Supabase Auth origin and publishable identifier; grant no application data access. Android release configuration receives only public authentication configuration. |
| `SUPABASE_AUTH_ADMIN_KEY` | Restricted server Auth administration adapter. |
| `DATABASE_URL` | Server-only pooled connection for the non-owner, non-BYPASSRLS runtime role. |
| `SCHOOL_WORKER_SECRET` | Server and scheduler only, protecting delivery-worker invocation. |

## Foundation integration

- F02 migration `20261119195638_app_foundation.sql` defines the private schema and the `app_runtime` group role. D02 provisions its separate login membership securely and configures transaction pooling. Every new app function must revoke default PUBLIC execution explicitly.
- OpenAPI v1 and TypeScript contracts live under `packages/contracts`. The Android JSON envelope lives in `apps/android/app/src/main/java/de/madrasty/app/api/Wire.kt`.
- F03 web assets live in `apps/web/public`, with checked-in Android resources under `apps/android/app/src/main/res`. The seal and notebooks are derived from the approved preview's source artwork. Both clients share initial loading, refreshing, ready, stale, empty, error, offline, offline draft, conflict, read-only and forbidden states. Android uses static skeletons and web respects reduced motion.

## Identity deployment bindings

- Migration 20261119200552 owns verified account and device session bindings, logout-only tickets and the token hook. D02 enables the custom access-token hook app.block_revoked_auth_refresh in the selected Supabase environment. Session and persona are checked again in each scoped transaction.
- Android builds accept the stable school origin via Gradle property madrasty.apiOrigin (environment equivalent ORG_GRADLE_PROJECT_madrasty.apiOrigin). The school origin serves public Auth configuration at /api/v1/auth/config. The APK never embeds the Supabase project origin, project key or application credentials.
- The Android HTTPS callback is /auth/android/callback. D04 supplies the school's host, confirms final signing identity, publishes the verified App Links association and configures Auth redirect allowlists. Account recovery and invitation owners start the appropriate PKCE flow.
- Provider-independent logout tickets only revoke active school sessions. C05 owns detaching device delivery rows on persona switch/logout and rechecking recipient eligibility. Build and source review attest compilation only.
