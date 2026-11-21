import { accessEditSchema } from "@madrasty/contracts";
import { z } from "zod";
import { ApiError, api, data, readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { readAccess, replaceAccess } from "@/server/access/capabilities";
import { requireFreshFactor } from "@/server/identity/assurance";
import { requestCredential } from "@/server/identity/session";

type Route = { params: Promise<{ id: string }> };

async function target(route: Route) {
  const id = z.uuid().safeParse((await route.params).id);
  if (!id.success) throw new ApiError("not_found");
  return id.data;
}

export const GET = api(async (request, ctx, route: Route) => {
  const actor = await requireActor(request, ctx);
  return data(await readAccess(actor, await target(route)));
});

export const PATCH = api(async (request, ctx, route: Route) => {
  const actor = await requireActor(request, ctx);
  await requireFreshFactor(requestCredential(request).token);
  const edit = await readJson(request, accessEditSchema);
  return data(await replaceAccess(actor, await target(route), edit));
});
