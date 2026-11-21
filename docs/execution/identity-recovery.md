# Identity recovery runbook

School administration uses a verified provider identity, a school grant and a current verified TOTP factor. AAL1 administration can open security setup. School mutations and data require AAL2. Bank changes additionally require a fresh TOTP proof. Deactivation and prospective changes to the last capable access administrator share the same transaction lock.

## First pre-launch administrator

Use operator-only access outside the Vercel environment. The named approver confirms the staging project ref and the controlled recipient independently. Bind `MADRASTY_BOOTSTRAP_ENV=prelaunch`, `MADRASTY_BOOTSTRAP_PROJECT_REF`, `MADRASTY_BOOTSTRAP_DB_URL`, `MADRASTY_BOOTSTRAP_AUTH_KEY` and `MADRASTY_BOOTSTRAP_APP_ORIGIN` with the operator's protected secret store.

Run `node scripts/identity/bootstrap-admin.ts <controlled-email> <new-private-file>` from the installed workspace after the identity migrations. Keep the file outside Git and out of chat and build logs. The operator delivers the expiring link through the approved controlled environment and removes the temporary file. Refreshing a pending activation requires the same named address and creates a replacement provider challenge. After proving possession and setting a password, the recipient signs in and verifies TOTP. Until that verification, the admin account cannot access school data.

## Lost factor or unavailable administrator

1. Record the named school approver, tenant and incident reference. Verify ownership through an independently confirmed channel using the school's agreed identity process.
2. Identify the intended provider user and school account with restricted operator access. Use the provider's factor administration to remove the lost factor. Freeze the account or revoke its school sessions before exposing a new setup path, and record the authorized recovery without secrets.
3. Revoke previous sessions, have the owner sign in with verified credentials and enroll a new authenticator. Keep administration blocked until AAL2 is confirmed. Confirm the successor or recovered administrator has the access-management grant.
4. Record timestamp, approver, operator, affected account reference, factor action, revocations and re-enrollment outcome. Keep actual authenticator seeds, email tokens and credentials out of the record. Q02/Q03/Q07 own runtime verification after the candidate is deployed.

D02 provisions Auth with self-signup disabled, secure email changes, short-lived tokens, the refresh-revocation hook and allowlisted school redirects. Templates route users to the school confirmation page with a provider token hash. The page requires an explicit action before it redeems the challenge. Bind SMTP to controlled recipients for pre-launch.
