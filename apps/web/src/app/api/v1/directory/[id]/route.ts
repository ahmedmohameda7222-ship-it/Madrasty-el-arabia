import { directoryIdSchema } from "@madrasty/contracts";
import { ApiError, api, data } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { readDirectoryEntry } from "@/server/identity/directory";

type Route = { params: Promise<{ id: string }> };

export const GET = api(async (request, context, route: Route) => {
  const actor = await requireActor(request,context);
  const id = directoryIdSchema.safeParse((await route.params).id);
  if (!id.success) throw new ApiError("not_found");
  return data(await readDirectoryEntry(actor, id.data));
});
