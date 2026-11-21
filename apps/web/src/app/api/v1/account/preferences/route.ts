import { localeSchema, preferencesSchema } from "@madrasty/contracts";
import { ApiError, api, data, readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { readPreferences, savePreferences } from "@/server/identity/preferences";

export const GET = api(async (request, context) => {
  const actor = await requireActor(request, context);
  const value = new URL(request.url).searchParams.get("locale") ?? "ar";
  const locale = localeSchema.safeParse(value);
  if (!locale.success) throw new ApiError("validation");
  return data(await readPreferences(actor, locale.data));
});

export const PATCH = api(async (request, context) => {
  const actor = await requireActor(request, context);
  const input = await readJson(request, preferencesSchema);
  return data((await savePreferences(actor, request.headers.get("idempotency-key"), input)).data);
});
