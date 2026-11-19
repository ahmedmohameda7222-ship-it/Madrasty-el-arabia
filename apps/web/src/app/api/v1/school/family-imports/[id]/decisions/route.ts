import { importDecisionInput } from "@madrasty/contracts";
import { z } from "zod";
import { ApiError, api, data, readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { decideImport } from "@/server/school/imports";

export const PATCH = api(async (request, ctx, route: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor(request, ctx);
  const id = z.uuid().safeParse((await route.params).id);
  if (!id.success) throw new ApiError("not_found");
  const result = await decideImport(actor, id.data, request.headers.get("idempotency-key"), await readJson(request, importDecisionInput));
  return data(result.data);
});
