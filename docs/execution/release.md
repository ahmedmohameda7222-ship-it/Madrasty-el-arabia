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
| Supabase project | School connection, ref `ycsyghyigkadtugluugm`, region `eu-west-1`, PostgreSQL 17.12. Read-only deployment inventory found zero Auth users and sessions, Storage buckets and objects, app/public tables, target application roles and applied migrations. |
| Supabase migration access | Local CLI 2.121.0 authenticated to an account whose project list excludes the school project. School CLI access or an operator-managed migration connection is outstanding. |
| Vercel | Created dedicated pre-launch project `madrasty-el-arabia-prelaunch` (`prj_lB5FQ4zDGXQk9Qf9pMrIVACah0lY`) in `ahmed-s-projectssasa` and confirmed Node `24.x`. The Preview configuration has `SCHOOL_ENVIRONMENT`, `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` from the school connection. The verified domain inventory had no school hostname. No candidate deployment exists. |
| Delivery | SMTP, transactional sender, VAPID, Firebase and controlled recipient bindings are pending. No provider delivery has been initiated. |
| Android custody | Both debug and unsigned release variants compiled. The signed release, prior signed baseline, permanent origin, package ID and certificate remain pending. Public install and version endpoints only expose configured release metadata. |

## Candidate freeze

D05 records the full source commit, the ordered applied migration ledger, Vercel deployment ID and origin, OpenAPI SHA-256, APK size/hash/version/public signing certificate, worker revision, recovery pointer and the operational contact. The complete candidate and Q01 entry gate are pending.
