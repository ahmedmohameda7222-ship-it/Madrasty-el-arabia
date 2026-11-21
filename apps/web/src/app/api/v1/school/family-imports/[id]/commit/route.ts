import { importCommitInput } from "@madrasty/contracts";
import { z } from "zod";
import { ApiError, api, data, readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { commitImport } from "@/server/school/imports";

export const POST = api(async (request, ctx, route: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor(request, ctx);
  const id = z.uuid().safeParse((await route.params).id);
  if (!id.success) throw new ApiError("not_found");
  const { reviewedRevision } = await readJson(request, importCommitInput);
  const result = await commitImport(actor, id.data, request.headers.get("idempotency-key"), reviewedRevision);
  return data(result.data);
});
