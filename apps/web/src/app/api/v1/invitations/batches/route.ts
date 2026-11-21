import { issueBatchInput } from "@madrasty/contracts";
import { api, data, readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { issueBatch } from "@/server/identity/invitations";

export const POST = api(async (request, ctx) => {
  const actor = await requireActor(request, ctx);
  const result = await issueBatch(actor, request.headers.get("idempotency-key"), await readJson(request, issueBatchInput));
  return data(result.data, result.replayed ? 200 : 202);
});
