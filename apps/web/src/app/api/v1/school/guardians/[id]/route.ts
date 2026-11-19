import { updateGuardianInput } from "@madrasty/contracts";
import { z } from "zod";
import { ApiError, api, data, readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { readGuardian, updateGuardian } from "@/server/school/families";

type Route = { params: Promise<{ id: string }> };
async function target(route: Route) {
  const id = z.uuid().safeParse((await route.params).id);
  if (!id.success) throw new ApiError("not_found");
  return id.data;
}

export const GET = api(async (request, ctx, route: Route) => {
  const actor = await requireActor(request, ctx);
  return data(await readGuardian(actor, await target(route)));
});

export const PATCH = api(async (request, ctx, route: Route) => {
  const actor = await requireActor(request, ctx);
  const result = await updateGuardian(actor, await target(route), request.headers.get("idempotency-key"),
    await readJson(request, updateGuardianInput));
  return data(result.data);
});
