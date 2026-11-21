import { pageQuerySchema } from "@madrasty/contracts";
import { z } from "zod";
import { ApiError, api, data } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { batchChoices } from "@/server/identity/invitations";

export const GET = api(async (request, ctx, route: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor(request, ctx);
  const id = z.uuid().safeParse((await route.params).id);
  if (!id.success) throw new ApiError("not_found");
  const query = pageQuerySchema.extend({ cursor: z.uuid().optional() }).safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) throw new ApiError("validation");
  const result = await batchChoices(actor, id.data, query.data);
  return data(result.rows, 200, result.nextCursor ? { nextCursor: result.nextCursor } : undefined);
});
