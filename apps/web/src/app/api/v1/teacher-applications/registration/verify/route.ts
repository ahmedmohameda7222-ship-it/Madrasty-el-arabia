import { applicantVerifyInput } from "@madrasty/contracts";
import { api, readJson } from "@/server/http";
import { verifyApplicantEmail } from "@/server/identity/teacherApplications";
import { assertWebMutation } from "@/server/identity/session";

export const POST = api(async (request) => {
  if (request.headers.has("origin")) assertWebMutation(request, false);
  await verifyApplicantEmail(await readJson(request, applicantVerifyInput));
  return new Response(null, { status: 204 });
});
