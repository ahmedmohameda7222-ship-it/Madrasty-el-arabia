import { signInInput } from "@madrasty/contracts";
import { api, readJson } from "@/server/http";
import { applicantSignIn, endApplicantSession } from "@/server/identity/teacherApplications";
import { assertWebMutation, rateLimitSignIn } from "@/server/identity/session";

export const POST = api(async (request) => {
  assertWebMutation(request, false);
  const input = await readJson(request, signInInput);
  await rateLimitSignIn(request, input.email);
  return applicantSignIn(request,input.email,input.password);
});

export const DELETE = api(async (request) => {
  assertWebMutation(request, true);
  return endApplicantSession(request);
});
