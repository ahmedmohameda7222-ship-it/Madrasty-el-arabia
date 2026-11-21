import { capabilityKeys } from "@madrasty/contracts";
import { api, data } from "@/server/http";
import { withActor } from "@/server/db/scoped";
import { requireActor } from "@/server/identity/actor";

export const GET = api(async (request, ctx) => {
  const actor = await requireActor(request, ctx);
  if (actor.persona !== "admin" || actor.assurance !== "aal2") return data([]);
  const allowed = await withActor(actor, (tx) => tx<{ key: string }[]>`
    select key from unnest(${tx.array([...capabilityKeys])}::text[]) key
    where app.has_capability(key) order by key
  `);
  return data(allowed.map(({ key }) => key));
});
