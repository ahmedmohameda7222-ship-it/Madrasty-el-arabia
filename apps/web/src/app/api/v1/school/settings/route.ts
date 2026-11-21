import { settingsInput } from "@madrasty/contracts";
import { api, data, readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { readSettings, writeSettings } from "@/server/school/calendar";

export const GET = api(async (request, ctx) => data(await readSettings(await requireActor(request, ctx))));

export const PATCH = api(async (request, ctx) => {
  const actor = await requireActor(request, ctx);
  const result = await writeSettings(actor, request.headers.get("idempotency-key"), await readJson(request, settingsInput));
  return data(result.data);
});
