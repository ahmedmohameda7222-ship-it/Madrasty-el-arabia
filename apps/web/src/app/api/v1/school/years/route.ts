import { yearInput } from "@madrasty/contracts";
import { api, data, readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { createYear, readYears } from "@/server/school/calendar";

export const GET = api(async (request, ctx) => data(await readYears(await requireActor(request, ctx))));

export const POST = api(async (request, ctx) => {
  const actor = await requireActor(request, ctx);
  const result = await createYear(actor, request.headers.get("idempotency-key"), await readJson(request, yearInput));
  return data(result.data, result.replayed ? 200 : 201);
});
