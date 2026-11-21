import { ApiError, api, data } from "@/server/http";
import { requestCredential, resolveSchoolSession } from "@/server/identity/session";
import { makeRevocationTicket } from "@/server/identity/revocation";

export const POST = api(async (request) => {
  const credential = requestCredential(request);
  if (credential.kind !== "bearer") throw new ApiError("forbidden");
  const session = await resolveSchoolSession(credential.token);
  return data({ ticket: await makeRevocationTicket(session) });
});
