import { applicationDecisionInput } from "@madrasty/contracts";
import { z } from "zod";
import { ApiError, api, data, readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { decideApplication } from "@/server/identity/teacherApplications";

export const POST = api(async (request, ctx, route: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor(request, ctx);
  const id = z.uuid().safeParse((await route.params).id);
  if (!id.success) throw new ApiError("not_found");
  const choice = await readJson(request, applicationDecisionInput);
  const result = await decideApplication(actor, id.data, request.headers.get("idempotency-key"), choice);
  return data(result.data);
});
