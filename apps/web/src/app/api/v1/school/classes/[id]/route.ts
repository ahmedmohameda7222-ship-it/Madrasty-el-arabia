import { classChangeInput } from "@madrasty/contracts";
import { z } from "zod";
import { ApiError, api, data, readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { changeClass, readClass } from "@/server/school/enrollments";

type Route = { params: Promise<{ id: string }> };
async function target(route: Route) {
  const parsed = z.uuid().safeParse((await route.params).id);
  if (!parsed.success) throw new ApiError("not_found");
  return parsed.data;
}

export const GET = api(async (request, ctx, route: Route) => data(await readClass(await requireActor(request, ctx), await target(route))));

export const PATCH = api(async (request, ctx, route: Route) => {
  const actor = await requireActor(request, ctx);
  const result = await changeClass(actor, await target(route), request.headers.get("idempotency-key"),
    await readJson(request, classChangeInput));
  return data(result.data);
});
