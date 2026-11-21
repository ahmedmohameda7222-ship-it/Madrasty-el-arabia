# Final QA evidence

The school owner directed automated QA on 2026-11-21 and deferred the real administrator's QR setup, live email delivery and physical-device runs. The software suites use disposable synthetic data. Live verification uses public reads of the operating site and its signed download.

## Candidate

| Item | Value |
|---|---|
| Web/API source | `a45f18ed79dc5e315a8bb91f07c9f5b9bc086d14` |
| Operating Vercel deployment | `dpl_7UYnxMtSN6v3pe6jkCrsyiezkFQc`, READY on `https://madrastyelarabia.vercel.app` |
| Database | School Supabase `ycsyghyigkadtugluugm`. The isolated local run applied the same 39 migrations with PostgreSQL 17.11 |
| API contract SHA-256 | `cadfa05acf2604019d3c7acd05c35e4b2252cde92c197a3abf8dbc9070e77316` |
| Published Android | `de.madrasty.app`, 0.1.1 / version code 2. APK hash and signer match [release.md](release.md) |
| Automated run configuration | Node 24.20.0, pnpm 11.25.0 and local Supabase CLI 2.121.0. Loopback app on 4300, Auth on 55421 and PostgreSQL on 55422. School timezone Europe/Berlin |

## Reproduced release defect

Q05, private chat, synthetic guardian. A valid message returned 500 with request `63c90818-6fd7-42c1-8631-72af9d48db87`. The transaction saved zero messages. The publisher supplied the database's signed 64-bit sequence as a decimal string and the event validator required a JavaScript integer. Commit `a45f18e` accepts the canonical bounded decimal representation and continues to accept prior positive numeric values. The PostgreSQL consumer reads both as `bigint`. The same local flow subsequently verified message delivery to the teacher, idempotent resend, read state, reaction, and concealment from administration and finance. The corrected source was published to the school origin.

## Automated coverage

The clean run of `pnpm qa:all` exited 0 with **57 passed, zero failed and zero skipped**. This includes 53 Node/Playwright tests and four Kotlin JVM tests. `pnpm check:types` exited 0. The live and local migration ledgers matched all 39 versions. The consolidated driver log is `%LOCALAPPDATA%/MadrastyBuild/qa-supabase/candidate-a45f18e-consolidated.log`.

| Command | Passed |
|---|---:|
| `qa:contracts` | 13 |
| `qa:school` | 7 |
| `qa:policy` | 3 |
| `qa:academics` | 5 |
| `qa:communication` | 2 |
| `qa:finance` | 1 |
| `qa:web` | 19 |
| `qa:android` | 6 |
| `qa:ops` | 1 |

Q07 also restored a logical dump into a newly created disposable database separate from the source database in the local instance. The dump and comparison finished in 4.53 seconds. Source and restore each had six pupils, eight links, 12 synthetic identities, two invoices and an invoice total of 6,400 minor units. There were zero private storage objects in this run. The dispatcher accepted zero external deliveries.

The preliminary runs found fixture issues with the timetable assignment type, private attendance detail parameter, overlapping synthetic MFA sessions and a pupil paused on the browser test date. Those were corrected in the harness and the clean run passed. The chat failure above required and received a product fix.

| Plan card | Exercised cases |
|---|---|
| Q01 | Wire and error schemas, localized field keys, API version, Android Auth discovery, two isolated synthetic runs and scoped cleanup, guardian pagination, concealed records and provider session expiration |
| Q02 | School settings and calendar, classes, staffing, dated substitute, timetable collision, roster, role switching, CSV sibling matching and duplicate handling, XLSX identifier/formula handling, effective transfer, audit privacy and rollover replay |
| Q03 | Database grants for public roles, non-owner app role, interleaved teacher/guardian/finance access, stale child link revocation and rejected idempotent replay |
| Q04 | Excuse lock, bulk skip, private reason, actual arrival, approval, offline conflict reconciliation in desktop Edge, curriculum draft and publication, blank/zero/half-point grades, private exam results and a correction, evaluation and reports |
| Q05 | Private chat, reaction, read state, message replay, protected Arabic/German class announcement, bank step-up on a synthetic account, monthly fee replay, named payer privacy, exact and unmatched receipts, partial allocation and reversal, child-specific stop and unaffected sibling invoices |
| Q06 | Desktop administration and role home pages, Arabic RTL and German LTR, narrow and desktop viewports in Edge, Firefox and WebKit, standalone PWA manifests, signed APK download, App Links metadata, Kotlin wire models and debug assembly |
| Q07 | Restricted dispatcher, no external delivery on local bindings, and logical PostgreSQL backup/restore comparison |

## Remaining acceptance

| Requirement | Next evidence | Owner |
|---|---|---|
| Owner administrator access and notifications | Confirm the real QR with Microsoft Authenticator, test activation/recovery and provider delivery in approved controlled mailboxes, and reconcile provider retry, bounce and live push | School owner and QA |
| Physical platforms | Complete the [device checklist](../../qa/devices/matrix.md), including Safari Home Screen, microphone, private attachments, offline attendance, push, Android upgrade and platform accessibility | School owner and QA |
| Broader workflow coverage | Exercise controlled invitation/teacher onboarding, signed media upload and private byte delivery, notification timing and further offline/native paths | QA |
| Operational recovery | Restore private object bytes and run the service against a separate Supabase target with outbound providers disabled. Rehearse rollback and measure against the school's RTO/RPO | School owner and QA |

Q08 remains open for the listed acceptance evidence. No permission changes, test accounts, balances or messages were written to the operating school from these test suites.
