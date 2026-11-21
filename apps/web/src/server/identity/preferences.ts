import "server-only";
import { preferencesSchema, type Locale, type Preferences, type SchoolSession } from "@madrasty/contracts";
import { randomUUID } from "node:crypto";
import { commitCommand, hashCommand, requireRevision } from "@/server/db/commands";
import { withActor, type ActorContext, type Transaction } from "@/server/db/scoped";

async function savedPreferences(tx: Transaction) {
  const [row] = await tx`select ui_locale as "uiLocale", correspondence_locale as "correspondenceLocale",
    theme, revision from app.account_preference where account_id = app.actor_account()`;
  return row ? preferencesSchema.parse(row) : null;
}

export async function readPreferences(actor: ActorContext, locale: Locale) {
  return await withActor(actor, savedPreferences) ?? {
    uiLocale: locale, correspondenceLocale: locale, theme: "system", revision: 0,
  };
}

export async function schoolPreferences(session: SchoolSession, locale: Locale): Promise<Preferences> {
  if (session.activePersona === "admin" && session.assurance !== "aal2") {
    return { uiLocale: locale, correspondenceLocale: locale, theme: "system", revision: 0 };
  }
  return await readPreferences({
    requestId: randomUUID(), accountId: session.accountId, sessionId: session.sessionId,
    persona: session.activePersona, assurance: session.assurance,
  }, locale);
}

export function savePreferences(actor: ActorContext, key: string | null, input: Preferences) {
  return commitCommand(actor, "account.preferences", key, hashCommand(input), {
    authorize: async () => { /* The account policy binds every operation to the signed-in account. */ },
    mutate: async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtextextended('account.preference:' || app.actor_account()::text, 0))`;
      const previous = await savedPreferences(tx);
      requireRevision(previous?.revision ?? 0,input.revision);
      const revision = input.revision + 1;
      await tx`
        insert into app.account_preference(account_id, ui_locale, correspondence_locale, theme, revision)
        values (app.actor_account(), ${input.uiLocale}, ${input.correspondenceLocale}, ${input.theme}, ${revision})
        on conflict (account_id) do update set ui_locale = excluded.ui_locale, correspondence_locale = excluded.correspondence_locale,
          theme = excluded.theme, revision = excluded.revision
      `;
      return { ...input, revision };
    },
  });
}
