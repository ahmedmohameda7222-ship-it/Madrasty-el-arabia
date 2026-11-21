import { createStudentInput, familyQuerySchema } from "@madrasty/contracts";
import { ApiError, api, data, readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { createStudent, listStudents } from "@/server/school/families";

export const GET = api(async (request, ctx) => {
  const actor = await requireActor(request, ctx);
  const query = familyQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) throw new ApiError("validation");
  const result = await listStudents(actor, query.data);
  return data(result.rows, 200, result.nextCursor ? { nextCursor: result.nextCursor } : undefined);
});

export const POST = api(async (request, ctx) => {
  const actor = await requireActor(request, ctx);
  const result = await createStudent(actor, request.headers.get("idempotency-key"), await readJson(request, createStudentInput));
  return data(result.data, result.replayed ? 200 : 201);
});
