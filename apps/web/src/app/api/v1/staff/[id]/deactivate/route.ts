import { deactivateStaffInput } from "@madrasty/contracts";
import { z } from "zod";
import { ApiError, api, data, readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { deactivateStaff } from "@/server/identity/staffLifecycle";

export const POST = api(async (request, ctx, route: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor(request, ctx);
  const id = z.uuid().safeParse((await route.params).id);
  if (!id.success) throw new ApiError("not_found");
  return data(await deactivateStaff(actor, id.data, await readJson(request, deactivateStaffInput)));
});
