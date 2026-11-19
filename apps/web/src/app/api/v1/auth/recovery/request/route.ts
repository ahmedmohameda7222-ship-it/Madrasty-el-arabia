import { recoveryRequestInput } from "@madrasty/contracts";
import { api, data, readJson } from "@/server/http";
import { requestRecovery } from "@/server/identity/recovery";
import { assertWebMutation, rateLimitSignIn } from "@/server/identity/session";

export const POST = api(async (request) => {
  if (request.headers.has("origin")) assertWebMutation(request, false);
  const input = await readJson(request, recoveryRequestInput);
  await rateLimitSignIn(request, input.email);
  await requestRecovery(input.email, input.locale);
  return data({ accepted: true }, 202);
});
