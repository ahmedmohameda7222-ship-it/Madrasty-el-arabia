import { recoveryCompleteInput } from "@madrasty/contracts";
import { api, readJson } from "@/server/http";
import { completeRecovery } from "@/server/identity/recovery";
import { assertWebMutation } from "@/server/identity/session";

export const POST = api(async (request) => {
  if (request.headers.has("origin")) assertWebMutation(request, false);
  const input = await readJson(request, recoveryCompleteInput);
  await completeRecovery(input.challenge, input.newPassword);
  return new Response(null, { status: 204 });
});
