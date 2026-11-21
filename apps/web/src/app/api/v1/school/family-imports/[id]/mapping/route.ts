import { importMappingInput } from "@madrasty/contracts";
import { z } from "zod";
import { ApiError, api, data, readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { mapImport } from "@/server/school/imports";

export const PUT = api(async (request, ctx, route: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor(request, ctx);
  const id = z.uuid().safeParse((await route.params).id);
  if (!id.success) throw new ApiError("not_found");
  const result = await mapImport(actor, id.data, request.headers.get("idempotency-key"), await readJson(request, importMappingInput));
  return data(result.data);
});
