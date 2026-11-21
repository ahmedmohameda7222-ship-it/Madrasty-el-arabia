import "server-only";
import type { Capability } from "@madrasty/contracts";
import { ApiError } from "@/server/http";
import type { ActorContext, Transaction } from "@/server/db/scoped";

type ResourceCheck<T> = (tx: Transaction, actor: ActorContext) => Promise<T | null | undefined>;

export async function requireCapability(tx: Transaction, actor: ActorContext, key: Capability) {
  if (actor.persona !== "admin") throw new ApiError("forbidden");
  const [row] = await tx<{ allowed: boolean }[]>`select app.has_capability(${key}) as allowed`;
  if (!row.allowed) throw new ApiError("forbidden");
}

// Owners provide one predicate used by their read, search, count, export, and
// action queries. Admin capability and resource access are independent checks.
export async function authorize<T>(
  tx: Transaction, actor: ActorContext, adminCapability: Capability | null, readScoped: ResourceCheck<T>,
): Promise<T> {
  if (actor.persona === "admin" && adminCapability) await requireCapability(tx, actor, adminCapability);
  const permitted = await readScoped(tx, actor);
  if (permitted == null) throw new ApiError("not_found");
  return permitted;
}
