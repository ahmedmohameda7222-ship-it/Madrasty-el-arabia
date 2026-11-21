# Madrasty El Arabia pre-launch release

The owner approved a synthetic pre-launch environment. Production activation, accounts for actual families and delivery to real school recipients require approval after Q08.

## Assembly

Run these commands at the repository root with the pinned toolchain in [environment.md](environment.md).

1. Run `pnpm install --frozen-lockfile`.
2. Run `pnpm generate:contracts` when the OpenAPI-bound models or paths change. TypeScript and Kotlin share the generated resource link wire shape. Feature DTOs keep their existing runtime codecs.
3. Run `pnpm build:web`, `pnpm check:types` and `pnpm build:android`. The local debug APK demonstrates compilation. The candidate requires a separately signed release at a permanent school origin.
4. Keep the deployed API prefix at `/api/v1`. The prior supported APK uses the same prefix and existing envelope. The resource resolver is additive. Publish a same-signer baseline in D04 and exercise upgrade in Q06.

Email and direct record links use `/{locale}/open/{kind}/{id}`. The legacy notice landing delegates to the same resource resolver. Authenticated clients recheck the current account, persona and object scope before opening records. Academic and attendance links carry the scoped child explicitly.

## API and migration ownership

The operation IDs and paths are enumerated in [OpenAPI](../../packages/contracts/openapi.yaml). Migration filenames match the ownership below and carry their chronological version in the checked-in [migration directory](../../supabase/migrations/).

| API and service scope | Card |
|---|---|
| Health, envelopes, scoped DB runtime, commands and outbox | F01–F03 |
| Auth, account, access, staff grants, invitations and teacher applications | I01–I06 |
| School settings, years, pupils, classes, enrollment, imported families, published timetable and school work queues | S01–S08 |
| Attendance rosters, confirmations, family excuses, offline reconciliation and history | A01–A04 |
| Academic source records, homework, periodic assessment, exam schedule/results and reports | E01–E07 |
| Directory, office cases, threads, private media, broadcasts, notifications, publishing, dispatch and callbacks | C01–C08 |
| Bank, tariffs, invoices, receipts, finance reports, enrollment stops and stop reconciliation | B01–B05 |
| Allowlisted cross-client resource resolution and application links | D01 |

## Pre-launch targets

| Binding | Recorded evidence |
|---|---|
| Supabase project | School connection, ref `ycsyghyigkadtugluugm`, region `eu-west-1`, PostgreSQL 17.12. Initial inventory found no user data. All 39 migrations have been applied and matched the local ledger. |
| Supabase migration access | CLI 2.121.0 uses the default school login. The three restricted pooled roles are configured. The site URL, exact redirect list and refresh hook are bound through `supabase/config.toml`. |
| Vercel | Dedicated pre-launch project `madrasty-el-arabia-prelaunch` (`prj_lB5FQ4zDGXQk9Qf9pMrIVACah0lY`) runs on Node `24.x`. Vercel reports Ready and lists the owner-selected `https://madrastyelarabia.vercel.app` alias. The hosting target is named `production` and the application runs with `SCHOOL_ENVIRONMENT=prelaunch` and the synthetic account allowlist. |
| Delivery | The owner verified the school sender in Brevo. Supabase Auth uses the dedicated Brevo SMTP credential and the published Arabic/German templates for invitations, recovery and email changes. Vercel uses a separate API key restricted to transactional email with no fixed expiry. The authenticated Brevo callback is Active. Supabase Cron dispatch and cleanup jobs are enabled with their bearer in Vault. VAPID and FCM are bound. The first synthetic administrator remains pending activation. Email delivery evidence is pending Q02/Q05. |
| Firebase | `madrasty-elarabia-prelaunch`, Android app `1:419353957533:android:7d180a6f665f872efc7074`, package `de.madrasty.app`. The signed release certificate is registered. FCM HTTP v1 is enabled. A dedicated notification-only identity holds the Firebase Cloud Messaging API Admin role. Vercel stores the five `FCM_*` bindings, including the server credential as sensitive. Device delivery remains Q05/Q06 work. |
| Android custody | Package `de.madrasty.app` uses the owner-approved new school signer. Both builds pin the approved Vercel origin. Adding a custom hostname to a later APK requires the same package and signer and a higher version code. Signing custody is outside Git in the school operator’s Windows profile, protected by DPAPI. Portable backup and recovery custody remain pending. |


## Signed Android build record

School origin `https://madrastyelarabia.vercel.app` and Android package `de.madrasty.app`.

| Artifact | Size | SHA-256 |
|---|---:|---|
| Signed candidate 0.1.1, version code 2 | 11,758,251 | `d5ca02907bfaaa4604252603bbc8fd2a36b82d5eccf014ea11765051b4f8c99d` |
| Restricted signed baseline 0.1.0, version code 1 | 11,758,251 | `2df5ca627b6447424ad09d1e3532f589ca54af2bbeed6dfbe6c6e794a8ad10be` |

The SHA-256 of the signer certificate is `8cdd2ca77ae0051388be756512fdda8b50bfd2023b954d078f4079e8c2332fd3`. Both artifacts passed the signer integrity check. The candidate is distributed through the school’s `/download/android` route, backed by an immutable SHA-addressed APK object in Supabase. The baseline remains local for Q06.

## Candidate freeze

The local contract contains 200 paths and 259 operations. The 39 migration sources have distinct versions. The local unsigned release is `apps/android/app/build/outputs/apk/release/app-release-unsigned.apk` (11,745,955 bytes, SHA-256 `a0e5eecd58cd2226034fac869f09ab444e3f673441f6d4db5faf021f2e108294`). This path records assembly evidence.

The candidate below was frozen on 2026-11-21 before any final QA was written or run. The school owner operates the provider accounts and holds the recovery artifacts. The authorized test recipient is stored in Vercel's staging allowlist. Physical device evidence is due in Q06.

| Candidate field | Frozen value |
|---|---|
| Web, API and worker source | `56bb0332ee88e8f949ce325bfa2908bcdbd92075` |
| Vercel deployment and origin | `dpl_ANyRP974jpyEwyBGofGMSBxJhV5o`, `https://madrastyelarabia.vercel.app` |
| Supabase | `ycsyghyigkadtugluugm`, 39 remote versions matched the local filenames in the order below |
| OpenAPI SHA-256 | `a7b97021fded2ebd3da5f8046fe791251654741059ac009f04617c3abd512c9f` |
| Android | Signed APK 0.1.1/2 and signer above. The Android source remains `b298cf7591cf8d2ff4b7b931606232696b9f1cfe`. The new web deployment adds mail-provider application code. |
| Recovery | [Encrypted local freeze export](operations.md#pre-launch-recovery-checkpoint), with the two Cron jobs enabled after capture. Previous web deployment `dpl_BoRYBe6LqE5uPxLwAZxfRaVmbL2t` retains the same signed APK. |

```text
20261119195638 20261119200552 20261119201757 20261119202435 20261119203129
20261119203840 20261119204640 20261119205739 20261119210903 20261119211920
20261119212628 20261119213839 20261120005023 20261120010556 20261120011714
20261120012806 20261120013955 20261120021306 20261120022545 20261120023628
20261120024817 20261120025437 20261120030521 20261120131033 20261120132359
20261120133251 20261120134323 20261120135539 20261120142131 20261120143042
20261120144518 20261120150142 20261120181622 20261120182810 20261120190740
20261120194810 20261120201320 20261120202600 20261120205130
```

## School operation on the published domain

On 2026-11-21 the owner directed immediate school operation on the existing public origin and moved final QA after activation. The operating Vercel target is `SCHOOL_ENVIRONMENT=live` at `https://madrastyelarabia.vercel.app`. Final QA remains pending.

Deployment `dpl_xLU9MKiMRipQ9srJhGyZzgC8YpG4` uses web, API and worker source `f77624aba9702f5bdbd15a2beefde290ef6e0ea6`. All three Supabase pooler connections trust the project's public root CA while checking the TLS chain and hostname. The CA fingerprint is `807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa`. The database migration ledger, OpenAPI digest and signed Android artifact remain those recorded above.

The school mailbox is the primary administrator. Its address was confirmed through the provider account verification, the pending administrator grant was rebound to that identity, and the former identity lost school access. The initial password was supplied by the owner. Administrator operations still require a verified TOTP factor. One recovery message was accepted for the school mailbox. No family delivery or fixture execution took place in this cutover.

The current Vercel deployment is `dpl_BLi45nxkcMU3KZXTZegihv1RBP7G` (READY on the school origin), source `f99dfa15937c82c6d26022935521a0ad925a8cd1`. It adds authenticator QR rendering and replaces unfinished first-factor enrollment attempts. The OpenAPI SHA-256 is `cadfa05acf2604019d3c7acd05c35e4b2252cde92c197a3abf8dbc9070e77316`. The owner deferred confirmation of the real administrator's QR enrollment and email delivery while automated QA proceeds.

The Q05 chat fix supersedes that deployment. Vercel `dpl_7UYnxMtSN6v3pe6jkCrsyiezkFQc` reports READY on the school origin with source `a45f18ed79dc5e315a8bb91f07c9f5b9bc086d14`. It preserves 64-bit message sequences in the notification event and accepts earlier numeric values. It uses the same 39 migrations, OpenAPI digest and signed Android artifact. See [QA evidence](qa-evidence.md) for the coverage and open acceptance cases.

The owner completed administrator TOTP on the laptop at the Q08 follow-up. Deployment `dpl_2RDofEYyJsDhazEB6LStS5tWzEok` with source `6520dd032a369f85aa91b52f90ac4903306673b0` fixed the provider SVG preamble and displayed the QR on the school site. The current operating deployment, `dpl_CToF1pHubX6tBvSeWN7UqqRaQbPT` at `9e76eb93d991b63c1275e866e902e2dd599fd526`, also blocks credential form submission until sign-in is hydrated and uses POST on credential forms. Vercel reports READY on the school origin. Database migrations and the signed Android release match the above record.
