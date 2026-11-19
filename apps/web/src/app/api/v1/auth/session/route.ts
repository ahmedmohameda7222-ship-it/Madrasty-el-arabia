import { NextResponse } from "next/server";
import { ApiError, api, data, problem } from "@/server/http";
import { assertWebMutation, attachWebSession, clearWebSession, requestCookie, requestCredential,
  resolveSchoolSession, webRefresh } from "@/server/identity/session";

export const GET = api(async (request) => {
  const credential = requestCredential(request);
  return data(await resolveSchoolSession(credential.token, credential.kind === "bearer"));
});

export const POST = api(async (request, ctx) => {
  assertWebMutation(request, true);
  if (requestCookie(request, "locked")) throw new ApiError("unauthenticated");
  try {
    const { school, provider } = await webRefresh(request);
    return attachWebSession(NextResponse.json({ data: school }), provider, requestCookie(request, "csrf"));
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== "unauthenticated") throw error;
    const response = problem(error, ctx);
    const result = new NextResponse(response.body, { status: response.status, headers: response.headers });
    return clearWebSession(result);
  }
});
