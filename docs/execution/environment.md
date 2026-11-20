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

- D02 sets SCHOOL_ENVIRONMENT=prelaunch and supplies the exact PRELAUNCH_EMAIL_ALLOWLIST in server-only configuration. Auth registration/recovery skips delivery outside that list and the approved staging SMTP sink applies the same boundary at the provider. D06 owns live activation.
- The teacher applicant email template sends the verified applicant continuation using RedirectTo and a one-time TokenHash. D02 binds the Arabic and German /apply/verify redirects and ensures all configured Auth recipients are controlled. Applicant sessions have a separate limited cookie or provider bearer; a school persona requires an independent grant.
- D02 supplies INVITATION_ENVELOPE_KEY as 32 random bytes encoded base64url in the server and dispatcher environments. The dispatcher reads invitation proofs through INVITE_WORKER_DATABASE_URL with the app_invite_worker role and uses generation-specific provider idempotency.
- D02 provisions a separate restricted pooled login for DELIVERY_WORKER_DATABASE_URL with the app_delivery_worker role. The ordinary web/API DATABASE_URL continues to use the app_runtime role. Each worker login needs permission to assume its own runtime role.
- D03 binds RESEND_API_KEY, RESEND_FROM, RESEND_WEBHOOK_SECRET, WEB_PUSH_SUBJECT, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY and the FCM public Android configuration plus FCM_SERVICE_ACCOUNT_B64. D03 uses a scheduled bearer-protected POST to /api/v1/internal/dispatch and registers the signed Resend callback at /api/v1/internal/email-events. Both transactional email and device push require a verified recipient on PRELAUNCH_EMAIL_ALLOWLIST during pre-launch.


## Android packaging

Set the Gradle project properties `madrasty.apiOrigin`, `madrasty.applicationId`, `madrasty.versionCode` and `madrasty.versionName` for both the baseline and current release. In PowerShell, Gradle's environment form is `ORG_GRADLE_PROJECT_madrasty.apiOrigin` and correspondingly for the other properties. Use the same permanent HTTPS host, package ID and school-owned signer for both builds. The baseline uses the lower supported version code.

Run `pnpm build:android release` to compile an unsigned release. The publishable build uses `pnpm build:android signed-release`, with the school key supplied through protected environment bindings `MADRASTY_ANDROID_KEYSTORE`, `MADRASTY_ANDROID_STORE_PASSWORD`, `MADRASTY_ANDROID_KEY_ALIAS` and `MADRASTY_ANDROID_KEY_PASSWORD`. Keep the keystore and passwords outside the checkout and shell history.

For the signed candidate, use the pinned SDK Build Tools `apksigner verify --print-certs <actual-apk>`. Record the output certificate SHA-256, package ID, version, bytes and file SHA-256. Upload the verified APK to the authorized artifact store with Android's APK media type and a download disposition. Bind the public version and certificate fields in `.env.example` with the exact storage hostname and immutable artifact URL. The site exposes `/download/android`, `/api/v1/client-versions` and `/.well-known/assetlinks.json`. The Arabic and German `/install` pages include Safari installation and the school APK link.

[Apple Support installation instructions](https://support.apple.com/guide/iphone/turn-a-website-into-an-app-iphea86e5236/ios) · [Android App Links association](https://developer.android.com/training/app-links/configure-assetlinks)
