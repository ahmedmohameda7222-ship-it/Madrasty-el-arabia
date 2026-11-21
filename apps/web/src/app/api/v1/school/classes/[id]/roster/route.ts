import { pageQuerySchema, schoolDateSchema } from "@madrasty/contracts";
import { z } from "zod";
import { ApiError, api, data } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { readRoster } from "@/server/school/enrollments";

export const GET = api(async (request, ctx, route: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor(request, ctx);
  const id = z.uuid().safeParse((await route.params).id);
  if (!id.success) throw new ApiError("not_found");
  const query = pageQuerySchema.extend({ date: schoolDateSchema, cursor: z.uuid().optional() })
    .safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) throw new ApiError("validation");
  const result = await readRoster(actor, id.data, query.data.date, query.data.limit, query.data.cursor);
  return data(result.data, 200, result.nextCursor ? { nextCursor: result.nextCursor } : undefined);
});
