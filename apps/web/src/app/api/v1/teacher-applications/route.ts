import { applicationInput, applicationListInput } from "@madrasty/contracts";
import { ApiError, api, data, readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { listApplications, submitApplication } from "@/server/identity/teacherApplications";

export const GET = api(async (request, ctx) => {
  const actor = await requireActor(request, ctx);
  const query = applicationListInput.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) throw new ApiError("validation");
  const result = await listApplications(actor, query.data);
  return data(result.rows, 200, result.nextCursor ? { nextCursor: result.nextCursor } : undefined);
});

export const POST = api(async (request) => data(await submitApplication(request, await readJson(request, applicationInput)), 201));
