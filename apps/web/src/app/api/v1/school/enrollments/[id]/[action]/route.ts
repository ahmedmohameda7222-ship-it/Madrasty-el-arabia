import { enrollmentMoveInput } from "@madrasty/contracts";
import { z } from "zod";
import { ApiError, api, data, readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { moveEnrollment } from "@/server/school/enrollments";

export const POST = api(async (request, ctx, route: { params: Promise<{ id: string; action: string }> }) => {
  const actor = await requireActor(request, ctx);
  const path = z.object({ id: z.uuid(), action: z.enum(["transfer", "withdraw"]) }).safeParse(await route.params);
  if (!path.success) throw new ApiError("not_found");
  const result = await moveEnrollment(actor, path.data.id, path.data.action, request.headers.get("idempotency-key"),
    await readJson(request, enrollmentMoveInput));
  return data(result.data);
});
