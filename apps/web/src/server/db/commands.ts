import "server-only";
import { createHash } from "node:crypto";
import { idempotencyKeySchema } from "@madrasty/contracts";
import { ApiError } from "@/server/http";
import { withActor, type ActorContext, type Transaction } from "./scoped";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function canonicalJson(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export const hashCommand = (payload: Json) =>
  createHash("sha256").update(canonicalJson(payload)).digest("hex");

export function requireRevision(current: number, supplied: number) {
  if (current !== supplied) throw new ApiError("stale_revision");
}

type Command<T extends Json> = {
  // Re-read current session, persona and target scope in this transaction.
  // Do not perform precondition/revision checks here that would reject a valid replay.
  authorize: (tx: Transaction) => Promise<void>;
  mutate: (tx: Transaction) => Promise<T>;
};

export async function commitCommand<T extends Json>(
  ctx: ActorContext,
  operation: string,
  key: string | null,
  requestHash: string,
  command: Command<T>,
): Promise<{ data: T; replayed: boolean }> {
  const validatedKey = idempotencyKeySchema.safeParse(key);
  if (!validatedKey.success) throw new ApiError("invalid_idempotency_key");

  return withActor(ctx, async (tx) => {
    const lock = JSON.stringify([ctx.accountId, ctx.persona, operation, validatedKey.data]);
    await tx`select pg_advisory_xact_lock(hashtextextended(${lock}, 0))`;
    await command.authorize(tx);

    const [receipt] = await tx<{ request_hash: string; result: T }[]>`
      select request_hash, result from app.command_receipt
      where account_id = ${ctx.accountId} and persona = ${ctx.persona}::app.persona
        and operation = ${operation} and idempotency_key = ${validatedKey.data}
    `;
    if (receipt) {
      if (receipt.request_hash !== requestHash) throw new ApiError("idempotency_conflict");
      return { data: receipt.result, replayed: true };
    }

    const result = await command.mutate(tx);
    await tx`
      insert into app.command_receipt (account_id, persona, operation, idempotency_key, request_hash, result)
      values (${ctx.accountId}, ${ctx.persona}::app.persona, ${operation},
              ${validatedKey.data}, ${requestHash}, ${tx.json(result)})
    `;
    return { data: result, replayed: false };
  });
}
