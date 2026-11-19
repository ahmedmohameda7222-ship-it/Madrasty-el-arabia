import { familyQuerySchema } from "@madrasty/contracts";
import { ApiError, api, data } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { listChildren } from "@/server/school/families";

export const GET = api(async (request, ctx) => {
  const actor = await requireActor(request, ctx);
  const query = familyQuerySchema.pick({ cursor: true, limit: true }).safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) throw new ApiError("validation");
  const result = await listChildren(actor, query.data);
  return data(result.rows, 200, result.nextCursor ? { nextCursor: result.nextCursor } : undefined);
});
