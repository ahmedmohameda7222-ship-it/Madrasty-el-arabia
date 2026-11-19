import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Session } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { sessionSchema, type SchoolSession, type Persona } from "@madrasty/contracts";
import { ApiError } from "@/server/http";
import { withRuntime } from "@/server/db/scoped";
import { authProvider, providerFailure, verifiedClaims } from "./provider";

const cookie = (name: string) => `${process.env.NODE_ENV === "production" ? "__Host-" : ""}madrasty-${name}`;
const refreshLifetime = 30 * 24 * 60 * 60;

export function requestCookie(request: Request, name: string) {
  const prefix = `${cookie(name)}=`;
  return request.headers.get("cookie")?.split(";").map((item) => item.trim())
    .find((item) => item.startsWith(prefix))?.slice(prefix.length);
}

export function requestCredential(request: Request) {
  const header = request.headers.get("authorization");
  if (header !== null) {
    const token = /^Bearer (\S+)$/i.exec(header)?.[1];
    if (!token || token.length > 10_000) throw new ApiError("unauthenticated");
    return { token, kind: "bearer" as const };
  }
  if (requestCookie(request, "locked")) throw new ApiError("unauthenticated");
  const token = requestCookie(request, "session");
  if (!token) throw new ApiError("unauthenticated");
  return { token, kind: "web" as const };
}

export function assertWebMutation(request: Request, csrf: boolean) {
  const origin = process.env.APP_ORIGIN;
  if (!origin) throw new ApiError("unavailable");
  if (request.headers.get("origin") !== new URL(origin).origin ||
      request.headers.get("sec-fetch-site") === "cross-site") {
    throw new ApiError("forbidden");
  }
  if (!csrf) return;
  const supplied = request.headers.get("x-csrf-token");
  const expected = requestCookie(request, "csrf");
  if (!supplied || !expected || !/^[a-f0-9]{64}$/.test(supplied) || !/^[a-f0-9]{64}$/.test(expected) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    throw new ApiError("forbidden");
  }
}

function setCookie(response: NextResponse, name: string, value: string, maxAge: number, httpOnly = true) {
  response.cookies.set(cookie(name), value, {
    path: "/", httpOnly, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge,
  });
}

export function attachWebSession(response: NextResponse, session: Session, csrf?: string) {
  // Keep the expired access cookie briefly to distinguish refreshable and absent sessions.
  const maxAge = Math.max(60, session.expires_in + 60);
  setCookie(response, "session", session.access_token, maxAge);
  setCookie(response, "refresh", session.refresh_token, refreshLifetime);
  setCookie(response, "csrf", csrf ?? randomBytes(32).toString("hex"), refreshLifetime, false);
  return response;
}

export function clearWebSession(response: NextResponse) {
  setCookie(response, "session", "", 0);
  setCookie(response, "refresh", "", 0);
  setCookie(response, "csrf", "", 0, false);
  setCookie(response, "locked", "", 0, false);
  setCookie(response, "logout", "", 0);
  return response;
}

export async function resolveSchoolSession(access: string, initialize = false): Promise<SchoolSession> {
  const claims = await verifiedClaims(access);
  const [row] = await withRuntime((tx) => tx<{
    account_id: string; active_persona: Persona; personas: Persona[];
  }[]>`select * from app.resolve_session(${claims.sub}, ${claims.session_id}, ${initialize})`);
  if (!row) throw new ApiError("unauthenticated");
  // Explicitly form the wire DTO. Provider credentials never travel in domain responses.
  return sessionSchema.parse({
    accountId: row.account_id,
    sessionId: claims.session_id,
    personas: row.personas,
    activePersona: row.active_persona,
    assurance: claims.aal,
    expiresAt: new Date(claims.exp * 1000).toISOString(),
  });
}

export async function rateLimitSignIn(request: Request, email: string) {
  const trustedIp = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() : null;
  const allowed = await withRuntime(async (tx) => {
    const buckets: [string, number][] = [[`email:${email}`, 12]];
    if (trustedIp) buckets.unshift([`ip:${trustedIp}`, 50]);
    let withinLimits = true;
    for (const [raw, limit] of buckets) {
      const key = createHash("sha256").update(raw).digest("hex");
      const [hit] = await tx<{ allowed: boolean }[]>`select app.count_sign_in(${key}, ${limit}) as allowed`;
      withinLimits &&= hit.allowed;
    }
    return withinLimits;
  });
  if (!allowed) throw new ApiError("throttled");
}

export async function webSignIn(email: string, password: string) {
  const { data, error } = await authProvider().signInWithPassword({ email, password });
  if (error) providerFailure(error);
  if (!data.session) throw new ApiError("unauthenticated");
  try {
    const school = await resolveSchoolSession(data.session.access_token, true);
    return { school, provider: data.session };
  } catch (cause) {
    await providerSignOut(data.session.access_token, false).catch(() => undefined);
    throw cause;
  }
}

export async function webRefresh(request: Request) {
  const refresh_token = requestCookie(request, "refresh");
  if (!refresh_token) throw new ApiError("unauthenticated");
  const { data, error } = await authProvider().refreshSession({ refresh_token });
  if (error) providerFailure(error);
  if (!data.session) throw new ApiError("unauthenticated");
  const school = await resolveSchoolSession(data.session.access_token);
  return { school, provider: data.session };
}

export async function providerSignOut(access: string, allDevices: boolean) {
  // Auth logout accepts the current user's bearer and applies it to that session or account.
  const origin = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!origin || !key) throw new ApiError("unavailable");
  const url = new URL("/auth/v1/logout", origin);
  url.searchParams.set("scope", allDevices ? "global" : "local");
  const response = await fetch(url, {
    method: "POST", headers: { apikey: key, authorization: `Bearer ${access}` },
    cache: "no-store", signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok && response.status !== 401 && response.status !== 403) {
    throw new ApiError("unavailable");
  }
}
