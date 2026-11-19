import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const requireWeb = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const postgres = requireWeb("postgres") as typeof import("../../apps/web/node_modules/postgres");
const { createClient } = requireWeb("@supabase/supabase-js") as typeof import("../../apps/web/node_modules/@supabase/supabase-js");

const [emailArgument, destination] = process.argv.slice(2);
const email = emailArgument?.trim().toLowerCase();
const ref = process.env.MADRASTY_BOOTSTRAP_PROJECT_REF;
const url = process.env.MADRASTY_BOOTSTRAP_DB_URL;
const key = process.env.MADRASTY_BOOTSTRAP_AUTH_KEY;
const origin = process.env.MADRASTY_BOOTSTRAP_APP_ORIGIN;

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !destination ||
    !ref || !/^[a-z]{20}$/.test(ref) || !url || !key?.startsWith("sb_secret_") ||
    !origin || new URL(origin).protocol !== "https:" || process.env.MADRASTY_BOOTSTRAP_ENV !== "prelaunch") {
  throw new Error("Set prelaunch operator bindings, email and a new private output path.");
}

const connection = new URL(url);
if (connection.hostname !== `db.${ref}.supabase.co` && !connection.username.endsWith(`.${ref}`)) {
  throw new Error("The PostgreSQL operator URL must explicitly identify the approved project.");
}
const provider = createClient(`https://${ref}.supabase.co`, key,
  { auth: { autoRefreshToken: false, persistSession: false } }).auth.admin;
const sql = postgres(url, { ssl: "verify-full", prepare: false, max: 1, connect_timeout: 10 });

try {
  let activation: string | null = null;
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtextextended('madrasty:administrator-succession', 0))`;
    const [previous] = await tx<{
      submitted_email: string; account_id: string | null; provider_subject: string | null; activated_at: Date | null;
    }[]>`select submitted_email, account_id, provider_subject, activated_at from app.initial_admin where singleton`;
    if (previous && previous.submitted_email !== email) throw new Error("The pending administrator has a different verified recipient.");
    if (previous?.activated_at) return;
    const [otherAdmin] = await tx`select 1 from app.access_administrator where revoked_at is null limit 1`;
    if (otherAdmin && !previous) throw new Error("The school already has an access administrator.");

    const { data, error } = await provider.generateLink({ type: "magiclink", email });
    if (error || !data.user || !data.properties.hashed_token) throw new Error("Supabase could not prepare the named activation.");
    const subject = data.user.id;
    if (previous?.provider_subject && previous.provider_subject !== subject) {
      throw new Error("The provider identity changed. Use the restricted recovery procedure.");
    }
    const account = previous?.account_id ?? (await tx<{ id: string }[]>`
      insert into app.account (provider_subject, status) values (${subject}, 'pending') returning id
    `)[0].id;
    await tx`
      insert into app.initial_admin (singleton, submitted_email, account_id, provider_subject)
      values (true, ${email}, ${account}, ${subject}) on conflict (singleton) do nothing
    `;
    await tx`
      insert into app.persona_grant (account_id, persona) values (${account}, 'admin')
      on conflict (account_id, persona) do nothing
    `;
    await tx`insert into app.access_administrator (account_id) values (${account}) on conflict do nothing`;
    const page = new URL("/ar/account/security/activate", origin);
    page.searchParams.set("token_hash", data.properties.hashed_token);
    activation = page.toString();
  });
  if (activation) {
    await writeFile(resolve(destination), activation + "\n", { flag: "wx", mode: 0o600 });
    console.log("Prepared a single-use activation in the private output file.");
  } else console.log("The administrator is already initialized.");
} finally {
  await sql.end();
}
