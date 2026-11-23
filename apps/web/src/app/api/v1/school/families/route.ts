import { createFamilyInput } from "@madrasty/contracts";
import { api, data, readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { createFamily } from "@/server/school/families";

export const POST = api(async (request, ctx) => {
  const actor = await requireActor(request, ctx);
  const result = await createFamily(actor, request.headers.get("idempotency-key"), await readJson(request, createFamilyInput));
  return data(result.data, result.replayed ? 200 : 201);
});
