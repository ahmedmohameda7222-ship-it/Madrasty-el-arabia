import { redeemInvitationInput } from "@madrasty/contracts";
import { api, data, readJson } from "@/server/http";
import { claimInvite } from "@/server/identity/invitations";
import { assertWebMutation, requestCredential } from "@/server/identity/session";

export const POST = api(async (request) => {
  const credential = requestCredential(request);
  if (credential.kind === "web") assertWebMutation(request, true);
  const { token } = await readJson(request, redeemInvitationInput);
  return data(await claimInvite(credential.token, token, request.headers.get("idempotency-key")));
});
