import { ApiError, api, data } from "@/server/http";
import { enrollFactor } from "@/server/identity/assurance";
import { assertWebMutation, requestCredential } from "@/server/identity/session";

export const POST = api(async (request) => {
  const credential = requestCredential(request);
  if (credential.kind !== "web") throw new ApiError("forbidden");
  assertWebMutation(request, true);
  return data(await enrollFactor(credential.token), 201);
});
