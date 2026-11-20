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
| Vercel | Created dedicated pre-launch project `madrasty-el-arabia-prelaunch` (`prj_lB5FQ4zDGXQk9Qf9pMrIVACah0lY`) in `ahmed-s-projectssasa` and confirmed Node `24.x`. The owner selected `https://madrastyelarabia.vercel.app` as the initial origin, and Vercel verified the binding. That project uses a production alias at the hosting layer and `SCHOOL_ENVIRONMENT=prelaunch` with an application-level synthetic account allowlist. Release build `dpl_6x7Y3vf8sbCAZzSEK6hmxQq8dpWr` uses source `b298cf7591cf8d2ff4b7b931606232696b9f1cfe`. Vercel reports READY and lists the approved alias on this deployment. |
| Delivery | VAPID, worker authorization, the invitation envelope secret and the approved synthetic recipient allowlist are bound. The first synthetic administrator is pending activation. SMTP, Resend, Firebase and scheduling are pending. Supabase Free rejected custom templates with its default mail service. The Arabic/German templates are prepared in `supabase/templates` and need publishing after custom SMTP is set. No provider delivery has been initiated. |
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

D05 records the full source commit, the ordered applied migration ledger, Vercel deployment ID and origin, OpenAPI SHA-256, APK size/hash/version/public signing certificate, worker revision, recovery pointer and the operational contact. The complete candidate and Q01 entry gate are pending.
