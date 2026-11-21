import { redeemInvitationInput, signInInput } from "@madrasty/contracts";
import { ApiError, api, data, readJson } from "@/server/http";
import { claimInvite } from "@/server/identity/invitations";
import { authProvider, providerFailure } from "@/server/identity/provider";
import { assertWebMutation, providerSignOut, rateLimitSignIn } from "@/server/identity/session";

export const POST = api(async (request) => {
  if (request.headers.has("origin")) assertWebMutation(request, false);
  const input = await readJson(request, redeemInvitationInput.extend(signInInput.shape));
  await rateLimitSignIn(request, input.email);
  const signed = await authProvider().signInWithPassword({ email: input.email, password: input.password });
  if (signed.error) providerFailure(signed.error);
  if (!signed.data.session) throw new ApiError("unauthenticated");
  const token = signed.data.session.access_token;
  try {
    return data(await claimInvite(token, input.token, request.headers.get("idempotency-key")));
  } finally {
    await providerSignOut(token, false).catch(() => undefined);
  }
});
