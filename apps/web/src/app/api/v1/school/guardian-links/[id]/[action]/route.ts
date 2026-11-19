import { changeLinkInput } from "@madrasty/contracts";
import { z } from "zod";
import { ApiError, api, data, readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { changeLink } from "@/server/school/families";

export const POST = api(async (request, ctx, route: { params: Promise<{ id: string; action: string }> }) => {
  const actor = await requireActor(request, ctx);
  const values = z.object({ id: z.uuid(), action: z.enum(["approve", "revoke"]) }).safeParse(await route.params);
  if (!values.success) throw new ApiError("not_found");
  const result = await changeLink(actor, values.data.id, values.data.action, request.headers.get("idempotency-key"),
    await readJson(request, changeLinkInput));
  return data(result.data);
});
