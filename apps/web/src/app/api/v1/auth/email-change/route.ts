import { emailChangeInput } from "@madrasty/contracts";
import { api, data, readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { requestEmailChange } from "@/server/identity/recovery";
import { requestCredential } from "@/server/identity/session";

export const POST = api(async (request, ctx) => {
  const actor = await requireActor(request, ctx);
  const input = await readJson(request, emailChangeInput);
  await requestEmailChange(requestCredential(request).token, actor.persona, input.newEmail, input.reauthProof);
  return data({ accepted: true }, 202);
});
