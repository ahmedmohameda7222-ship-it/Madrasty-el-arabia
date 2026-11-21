import { classInput, classListing } from "@madrasty/contracts";
import { ApiError, api, data, readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { createClass, listClasses } from "@/server/school/enrollments";

export const GET = api(async (request, ctx) => {
  const actor = await requireActor(request, ctx);
  const valid = classListing.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!valid.success) throw new ApiError("validation");
  const result = await listClasses(actor, valid.data);
  return data(result.rows, 200, result.nextCursor ? { nextCursor: result.nextCursor } : undefined);
});

export const POST = api(async (request, ctx) => {
  const actor = await requireActor(request, ctx);
  const result = await createClass(actor, request.headers.get("idempotency-key"), await readJson(request, classInput));
  return data(result.data, result.replayed ? 200 : 201);
});
