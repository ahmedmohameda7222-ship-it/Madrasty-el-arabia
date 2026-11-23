import "server-only";
import { accessSummarySchema, accessTargetsSchema, type AccessEdit, type Capability, type SchoolSession } from "@madrasty/contracts";
import { withActor, type ActorContext, type Transaction } from "@/server/db/scoped";
import { appendAudit, appendEvent } from "@/server/db/outbox";
import { ApiError } from "@/server/http";
import { requireCapability } from "./policies";

export function listAccessTargets(ctx: ActorContext, limit: number, cursor: string | null) {
  return withActor(ctx, async (tx) => {
    await requireCapability(tx, ctx, "access.manage");
    const raw = await tx<{ accountId: string; email: string | null }[]>`
      select account_id as "accountId", email from app.access_targets(${limit + 1}, ${cursor})
    `;
    const rows = accessTargetsSchema.parse(raw);
    return { rows: rows.slice(0, limit), nextCursor: rows.length > limit ? rows[limit - 1].accountId : undefined };
  });
}

async function summary(tx: Transaction, id: string) {
  const [state] = await tx<{ detail: unknown }[]>`select app.access_summary(${id}) as detail`;
  if (state.detail == null) throw new ApiError("not_found");
  return accessSummarySchema.parse(state.detail);
}

export function readAccess(ctx: ActorContext, id: string) {
  return withActor(ctx, async (tx) => {
    await requireCapability(tx, ctx, "access.manage");
    return summary(tx, id);
  });
}

export function replaceAccess(ctx: ActorContext, id: string, edit: AccessEdit) {
  return withActor(ctx, async (tx) => {
    await requireCapability(tx, ctx, "access.manage");
    if (id === ctx.accountId) throw new ApiError("forbidden");
    const [result] = await tx<{ revision: number | null }[]>`
      select app.replace_access(${id}, ${edit.revision}, ${tx.json(edit)}) as revision
    `;
    if (result.revision == null) throw new ApiError("not_found");
    if (result.revision === -1) throw new ApiError("stale_revision");
    if (result.revision === -2) throw new ApiError("conflict");
    if (result.revision === -3) throw new ApiError("validation");
    await appendAudit(tx, { action: "access.grants_updated", aggregateId: id,
      metadata: { revision: result.revision, personas: edit.personas, capabilities: edit.capabilities.map(({ key }) => key) } });
    await appendEvent(tx, { type: "access.grants_updated", actorId: ctx.accountId,
      aggregateId: id, payload: { revision: result.revision } });
    return summary(tx, id);
  });
}

export function mayUse(session: SchoolSession, key: Capability) {
  if (session.activePersona !== "admin" || session.assurance !== "aal2") return Promise.resolve(false);
  return withActor({
    requestId: crypto.randomUUID(), accountId: session.accountId, sessionId: session.sessionId,
    persona: session.activePersona, assurance: session.assurance,
  }, async (tx) => {
    const [answer] = await tx<{ allowed: boolean }[]>`select app.has_capability(${key}) as allowed`;
    return answer.allowed;
  });
}

/** Read the school menu's permissions together using the same policies as the destination routes. */
export async function schoolMenuAccess(session: SchoolSession, keys: readonly Capability[]) {
  const isAdmin = session.activePersona === "admin";
  if (session.activePersona === "guardian" || (isAdmin && session.assurance !== "aal2")) {
    return { capabilities: [] as Capability[], moderation: false, delivery: false, stopManager: false };
  }
  const [access] = await withActor({
    requestId: crypto.randomUUID(), accountId: session.accountId, sessionId: session.sessionId,
    persona: session.activePersona, assurance: session.assurance,
  }, tx => tx<{ capabilities: Capability[]; moderation: boolean; delivery: boolean; stopManager: boolean }[]>`
    select
      case when ${isAdmin} then array(
        select key from unnest(${tx.array([...keys])}::text[]) as item(key) where app.has_capability(key)
      ) else array[]::text[] end as capabilities,
      case when ${isAdmin} then app.can_manage_chat_reports() else false end as moderation,
      app.may_operate_delivery_queue() as delivery,
      case when ${isAdmin} then app.enrollment_stop_staff() else false end as "stopManager"
  `);
  return access;
}

export const mayManageAccess = (session: import("@madrasty/contracts").SchoolSession) => mayUse(session, "access.manage");

/** Only the verified original Hauptadmin can provision or manage Administrators. */
export async function mayProvisionAdmin(session: SchoolSession) {
  if(session.activePersona !== "admin" || session.assurance !== "aal2") return false;
  return withActor({
    requestId:crypto.randomUUID(),accountId:session.accountId,sessionId:session.sessionId,
    persona:session.activePersona,assurance:session.assurance,
  }, async tx=>{
    const [answer]=await tx<{allowed:boolean}[]>`select app.is_hauptadmin() as allowed`;
    return answer.allowed;
  });
}
