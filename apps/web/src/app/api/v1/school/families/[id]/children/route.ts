import { z } from "zod";
import { createFamilyChildInput } from "@madrasty/contracts";
import { ApiError, api, data, readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { createFamilyChild } from "@/server/school/families";

export const POST = api(async (request, ctx, route: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor(request, ctx);
  const id = z.uuid().safeParse((await route.params).id);
  if (!id.success) throw new ApiError("not_found");
  const result = await createFamilyChild(actor, id.data, request.headers.get("idempotency-key"), await readJson(request, createFamilyChildInput));
  return data(result.data, result.replayed ? 200 : 201);
});
