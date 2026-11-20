# Pre-launch operations and recovery

Scope is the synthetic school environment only. This runbook becomes the candidate record when the operator completes the bindings in [release.md](release.md). Restore rehearsals and behavioral verification are Q07 work.

## Ordered release and rollback

1. Confirm project ref `ycsyghyigkadtugluugm`, organization `rxtrejfdldbuyokpubjf`, region `eu-west-1` and the expected pre-launch history in Supabase. Record the provider backup or restore point and the isolation of its destination.
2. With the school account signed in to the default CLI profile, run `supabase link --project-ref ycsyghyigkadtugluugm`. Review `supabase migration list --linked` and the exact pending filenames. One operator runs `supabase db push --linked --skip-vault` from this checkout. On interruption, read the migration ledger and continue the remaining entries. Applied DDL is changed with a new, forward-compatible migration.
3. Bind three independent pooled login identities. Each login can assume exactly one app group role `app_runtime`, `app_delivery_worker` or `app_invite_worker`. Each login is non-owner and has neither superuser nor BYPASSRLS. Place the three DSNs in the target's encrypted configuration. The app sets the group role only inside a transaction.
4. Bind Auth redirects to the permanent school origin. Configure the verified email templates and the refresh-revocation hook `app.block_revoked_auth_refresh`, then use [identity recovery](identity-recovery.md) to create the first controlled administrator. Turn on only the mechanisms required by the scoped application flows.
5. Bind the Vercel deployment to the recorded Git SHA. Keep `SCHOOL_ENVIRONMENT=prelaunch` and the exact `PRELAUNCH_EMAIL_ALLOWLIST` on the staging target. Configure matching SMTP restrictions and transactional sender identities before enabling schedules. Public install and association files remain available at the school origin.
6. Pause the scheduler during an application rollback. Reassign the authorized school alias to the last compatible Vercel deployment and restore its matching public client-version metadata. Retain the reviewed database migration ledger. If data needs recovery, restore into the agreed isolated destination and review the resulting ledger between release attempts. Capture the recovery action and remaining event backlog.

## Delivery and outage handling

- Supabase Cron calls the stable school POST `/api/v1/internal/dispatch` over HTTPS with a bearer from Vault. Bind the cadence to the environment's approved limit. The worker handles due database projections, email/push leases and bounded retries. Keep media cleanup on its own protected scheduler invocation and credential binding.
- Use the signed `/api/v1/internal/email-events` callback and provider evidence to reconcile uncertain email submissions. Do not reissue an uncertain payment, attendance or invitation email as a new send. Review the existing idempotency key, lease state and generation before a permitted redrive. A bounce remains visible to authorized staff.
- Alarm on age of oldest due notification projection, persistent invalid events, growing queued retries, unresolved provider submissions, scheduler failures and storage cleanup backlog. Record only event/job IDs, aggregate counts, state, ISO timestamps and revision. Keep student, invoice, email and message contents in their authorized tools.
- Scope email and device delivery to synthetic recipients. For a configuration or provider incident, pause the schedule, retain queued work, contain affected credentials, verify the new binding and resume the existing queue. Repeated attempts use the same operation-specific keys.
- For sign-in and role incidents use [identity recovery](identity-recovery.md). Revocation is authoritative for app/API access and immediately stops future provider claims.

## Backup and artifact custody

| Item | Boundary |
|---|---|
| Supabase database | Provider restore point captures application records, finance ledger, audit history, identities and queue state. Restore with outbound schedules disabled. |
| Private media | Back up approved private objects and their object names independently of a database backup. Reconcile object metadata to the restored database. |
| External settings | Vault bindings, Auth hooks/templates/SMTP, Vercel variables, DNS, mail webhooks, Firebase/VAPID registration, signed binaries and school signer custody are tracked separately. |
| Android rollback | Keep the last compatible APK and recorded signer. Android does not ordinarily install a lower version code over a higher one. A school-signed forward build is the usual recovery path. |
| Operation ownership | Record authorized release, database, DNS, signing and on-call owners, backup retention and recovery objectives before D05. Their approved values are pending. |

For each candidate record source SHA, migration versions, deployment ID and origin, OpenAPI SHA-256, worker revision, APK filename and byte count, SHA-256, version code/name, package ID, certificate SHA-256 and restore point. Store evidence with the release record. Keep secrets in the operator's credential stores.
