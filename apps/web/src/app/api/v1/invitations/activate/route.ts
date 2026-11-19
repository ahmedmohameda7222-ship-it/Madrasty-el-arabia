import { activateInvitationInput } from "@madrasty/contracts";
import { api, data, readJson } from "@/server/http";
import { activateInvite } from "@/server/identity/invitations";
import { assertWebMutation } from "@/server/identity/session";

export const POST = api(async (request) => {
  if (request.headers.has("origin")) assertWebMutation(request, false);
  const input = await readJson(request, activateInvitationInput);
  return data(await activateInvite(input, request.headers.get("idempotency-key")));
});
