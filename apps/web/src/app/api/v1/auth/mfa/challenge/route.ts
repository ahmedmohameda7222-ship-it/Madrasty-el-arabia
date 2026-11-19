import { mfaChallengeInput } from "@madrasty/contracts";
import { ApiError, api, data, readJson } from "@/server/http";
import { makeChallenge } from "@/server/identity/assurance";
import { assertWebMutation, requestCredential } from "@/server/identity/session";

export const POST = api(async (request) => {
  const credential = requestCredential(request);
  if (credential.kind !== "web") throw new ApiError("forbidden");
  assertWebMutation(request, true);
  const { factorId } = await readJson(request, mfaChallengeInput);
  return data(await makeChallenge(credential.token, factorId), 201);
});
