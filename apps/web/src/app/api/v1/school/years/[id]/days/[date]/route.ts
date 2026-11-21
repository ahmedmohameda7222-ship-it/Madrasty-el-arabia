import { dayInput, schoolDateSchema } from "@madrasty/contracts";
import { z } from "zod";
import { ApiError, api, data, readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { putDay } from "@/server/school/calendar";

export const PUT = api(async (request, ctx, route: { params: Promise<{ id: string; date: string }> }) => {
  const actor = await requireActor(request, ctx);
  const path = z.object({ id: z.uuid(), date: schoolDateSchema }).safeParse(await route.params);
  if (!path.success) throw new ApiError("not_found");
  const result = await putDay(actor, path.data.id, path.data.date, request.headers.get("idempotency-key"), await readJson(request, dayInput));
  return data(result.data);
});
