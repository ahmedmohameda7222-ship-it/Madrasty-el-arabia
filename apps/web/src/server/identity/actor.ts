import "server-only";
import { personaSchema } from "@madrasty/contracts";
import { ApiError, type RequestContext } from "@/server/http";
import type { ActorContext } from "@/server/db/scoped";
import { assertWebMutation, requestCredential, resolveSchoolSession } from "./session";

export async function requireActor(request: Request, context: RequestContext): Promise<ActorContext> {
  const credential = requestCredential(request);
  const session = await resolveSchoolSession(credential.token);
  const isWrite = !["GET", "HEAD"].includes(request.method);
  if (isWrite && credential.kind === "web") assertWebMutation(request, true);
  const supplied = request.headers.get("x-school-persona");
  if (isWrite || supplied !== null) {
    const expected = personaSchema.safeParse(supplied);
    if (!expected.success || expected.data !== session.activePersona) throw new ApiError("forbidden");
  }
  return {
    requestId: context.requestId,
    accountId: session.accountId,
    sessionId: session.sessionId,
    persona: session.activePersona,
    assurance: session.assurance,
  };
}
