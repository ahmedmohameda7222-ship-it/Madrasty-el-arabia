import { directoryQuerySchema } from "@madrasty/contracts";
import { ApiError, api, data } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { listDirectory } from "@/server/identity/directory";

export const GET = api(async (request, context) => {
  const actor = await requireActor(request, context);
  const filters = directoryQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!filters.success) throw new ApiError("validation");
  const result = await listDirectory(actor, filters.data);
  return data(result.rows, 200, result.nextCursor ? { nextCursor: result.nextCursor } : undefined);
});
