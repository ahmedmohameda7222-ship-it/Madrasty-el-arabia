import "server-only";
import type { z } from "zod";
import type { deactivateStaffInput } from "@madrasty/contracts";
import { ApiError } from "@/server/http";
import { withActor, type ActorContext } from "@/server/db/scoped";
import { appendAudit, appendEvent } from "@/server/db/outbox";

export function deactivateStaff(ctx: ActorContext, id: string, input: z.infer<typeof deactivateStaffInput>) {
  if (ctx.persona !== "admin") throw new ApiError("forbidden");
  return withActor(ctx, async (tx) => {
    const [entry] = await tx<{ revision: number | null }[]>`
      select app.deactivate_staff(${ctx.accountId}, ${id}, ${input.scope === "account"}, ${input.revision}) as revision
    `;
    if (entry.revision === null) throw new ApiError("not_found");
    if (entry.revision === -1) throw new ApiError("stale_revision");
    if (entry.revision === -2) throw new ApiError("conflict");
    await tx`insert into app.staff_deactivation_record(actor_id,target_account_id,request_id,requested_scope,reason)
      values (app.actor_account(),${id},app.actor_request(),${input.scope},${input.reason})`;
    await appendAudit(tx, { action: "staff.deactivated", aggregateId: id, metadata: { scope: input.scope } });
    await appendEvent(tx, { type: "staff.deactivated", actorId: ctx.accountId,
      aggregateId: id, payload: { scope: input.scope, revision: entry.revision } });
    return { revision: entry.revision };
  });
}
