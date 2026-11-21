import { emailChangeConfirmInput } from "@madrasty/contracts";
import { api, readJson } from "@/server/http";
import { confirmEmailChange } from "@/server/identity/recovery";
import { assertWebMutation } from "@/server/identity/session";

export const POST = api(async (request) => {
  if (request.headers.has("origin")) assertWebMutation(request, false);
  const { challenge } = await readJson(request, emailChangeConfirmInput);
  await confirmEmailChange(challenge);
  return new Response(null, { status: 204 });
});
