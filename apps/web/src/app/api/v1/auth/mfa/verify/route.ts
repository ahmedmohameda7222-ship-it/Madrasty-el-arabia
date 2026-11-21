import { mfaVerifyInput } from "@madrasty/contracts";
import { ApiError, api, readJson } from "@/server/http";
import { verifyChallenge } from "@/server/identity/assurance";
import { assertWebMutation, requestCredential } from "@/server/identity/session";

export const POST = api(async (request) => {
  const credential = requestCredential(request);
  if (credential.kind !== "web") throw new ApiError("forbidden");
  assertWebMutation(request, true);
  const { challengeId, code } = await readJson(request, mfaVerifyInput);
  return verifyChallenge(request, credential.token, challengeId, code);
});
