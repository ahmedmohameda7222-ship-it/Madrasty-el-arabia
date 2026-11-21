import { applicantEmailInput } from "@madrasty/contracts";
import { api, data, readJson } from "@/server/http";
import { requestApplicantEmail } from "@/server/identity/teacherApplications";
import { assertWebMutation, rateLimitSignIn } from "@/server/identity/session";

export const POST = api(async (request) => {
  if (request.headers.has("origin")) assertWebMutation(request, false);
  const input = await readJson(request, applicantEmailInput);
  await rateLimitSignIn(request, input.email);
  await requestApplicantEmail(input.email, input.locale);
  return data({ accepted: true }, 202);
});
