import { importSheetOptions } from "@madrasty/contracts";
import { z } from "zod";
import { ApiError, api, data } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { inspectImport } from "@/server/school/imports";

export const GET = api(async (request, ctx, route: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor(request, ctx);
  const id = z.uuid().safeParse((await route.params).id);
  if (!id.success) throw new ApiError("not_found");
  const query = importSheetOptions.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) throw new ApiError("validation");
  return data(await inspectImport(actor, id.data, query.data));
});
