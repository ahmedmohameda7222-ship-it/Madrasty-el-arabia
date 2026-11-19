import { pageQuerySchema } from "@madrasty/contracts";
import { z } from "zod";
import { ApiError, api, data } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { listAccessTargets } from "@/server/access/capabilities";

export const GET = api(async (request, ctx) => {
  const actor = await requireActor(request, ctx);
  const query = pageQuerySchema.extend({ cursor: z.uuid().optional() })
    .safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) throw new ApiError("validation");
  const { rows, nextCursor } = await listAccessTargets(actor, query.data.limit, query.data.cursor ?? null);
  return data(rows, 200, nextCursor ? { nextCursor } : undefined);
});
