import { NextResponse } from "next/server";
import { signOutInput } from "@madrasty/contracts";
import { ApiError, api, readJson } from "@/server/http";
import { withRuntime } from "@/server/db/scoped";
import { revokeWithTicket } from "@/server/identity/revocation";
import { assertWebMutation, clearWebSession, providerSignOut, requestCookie, requestCredential,
  resolveSchoolSession } from "@/server/identity/session";

export const POST = api(async (request) => {
  const bearer = request.headers.has("authorization");
  if (!bearer) assertWebMutation(request, true);
  const { allDevices } = await readJson(request, signOutInput);

  const ticket = bearer ? undefined : requestCookie(request, "logout");
  const expiredAccess = bearer ? undefined : requestCookie(request, "session");
  let access: string | undefined;
  if (ticket) {
    try {
      await revokeWithTicket(ticket, allDevices);
    } catch (error) {
      if (!(error instanceof ApiError) || error.code !== "unauthenticated" || allDevices) throw error;
    }
    access = expiredAccess;
  } else {
    try {
      const credential = requestCredential(request);
      const current = await resolveSchoolSession(credential.token);
      await withRuntime((tx) => tx`select app.revoke_sessions(${current.accountId}, ${current.sessionId}, ${allDevices})`);
      access = credential.token;
    } catch (error) {
      if (bearer || allDevices || !(error instanceof ApiError) || error.code !== "unauthenticated") throw error;
    }
  }

  if (access) await providerSignOut(access, allDevices).catch(() => {
    console.warn("Auth provider session revocation pending reconciliation");
  });
  const response = new NextResponse(null, { status: 204 });
  return bearer ? response : clearWebSession(response);
});
