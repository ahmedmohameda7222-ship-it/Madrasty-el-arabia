import { NextResponse } from "next/server";
import { signInInput } from "@madrasty/contracts";
import { ApiError, api, readJson } from "@/server/http";
import { assertWebMutation, attachWebSession, rateLimitSignIn, requestCookie, webSignIn } from "@/server/identity/session";
import { makeRevocationTicket } from "@/server/identity/revocation";

export const POST = api(async (request) => {
  assertWebMutation(request, false);
  if (requestCookie(request, "locked")) throw new ApiError("conflict");
  const { email, password } = await readJson(request, signInInput, 4096);
  await rateLimitSignIn(request, email);
  const { school, provider } = await webSignIn(email, password);
  const response = attachWebSession(NextResponse.json({ data: school }), provider);
  const ticket = await makeRevocationTicket(school);
  response.cookies.set(
    process.env.NODE_ENV === "production" ? "__Host-madrasty-logout" : "madrasty-logout",
    ticket, { path: "/", httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", maxAge: 2_592_000 },
  );
  return response;
});
