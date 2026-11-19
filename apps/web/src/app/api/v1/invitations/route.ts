import { invitationListInput, issueInvitationInput } from "@madrasty/contracts";
import { ApiError, api, data, readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { issueInvitation, listInvitations } from "@/server/identity/invitations";

export const GET = api(async (request, ctx) => {
  const actor = await requireActor(request, ctx);
  const query = invitationListInput.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) throw new ApiError("validation");
  const result = await listInvitations(actor, query.data);
  return data(result.rows, 200, result.nextCursor ? { nextCursor: result.nextCursor } : undefined);
});

export const POST = api(async (request, ctx) => {
  const actor = await requireActor(request, ctx);
  const result = await issueInvitation(actor, request.headers.get("idempotency-key"), await readJson(request, issueInvitationInput));
  return data(result.data, result.replayed ? 200 : 201);
});
