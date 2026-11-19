import { issueTeacherInput } from "@madrasty/contracts";
import { api, data, readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { createTeacherInvitation } from "@/server/identity/invitations";

export const POST = api(async (request, ctx) => {
  const actor = await requireActor(request, ctx);
  const result = await createTeacherInvitation(actor, request.headers.get("idempotency-key"), await readJson(request, issueTeacherInput));
  return data(result.data, result.replayed ? 200 : 201);
});
