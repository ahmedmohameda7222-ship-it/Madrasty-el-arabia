import "server-only";
import { z } from "zod";
import { ApiError } from "@/server/http";
import { withRuntime } from "@/server/db/scoped";
import { attachWebSession, requestCookie, resolveSchoolSession } from "./session";
import { verifiedClaims } from "./provider";
import { NextResponse } from "next/server";
import type { Session } from "@supabase/supabase-js";

const factorSchema = z.object({
  id: z.uuid(), friendly_name: z.string().optional(), factor_type: z.literal("totp"),
  status: z.enum(["verified", "unverified"]),
});
const enrolledFactorSchema = z.object({
  id: z.uuid(),
  totp: z.object({
    secret: z.string(), uri: z.string().startsWith("otpauth://"),
    // Supabase emits a rectangle for each QR module, including white ones.
    qr_code: z.string().max(1024 * 1024).regex(/^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i),
  }),
});
const challengeSchema = z.object({ id: z.uuid(), expires_at: z.number() });
const tokenResponse = z.object({ access_token: z.string(), refresh_token: z.string(), expires_in: z.number() });
const authenticatorName = "Madrasty El Arabia";

export async function providerRequest(path: string, access: string, options = {} as RequestInit): Promise<unknown> {
  const origin = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!origin || !key) throw new ApiError("unavailable");
  let response: Response;
  try {
    response = await fetch(new URL(`/auth/v1${path}`, origin), {
      ...options, signal: AbortSignal.timeout(8_000),
      headers: { apikey: key, Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
      cache: "no-store",
    });
  } catch {
    throw new ApiError("unavailable");
  }
  if (!response.ok) {
    if (response.status === 429) throw new ApiError("throttled");
    if (response.status >= 500) throw new ApiError("unavailable");
    if (response.status === 401) throw new ApiError("unauthenticated");
    throw new ApiError("validation");
  }
  return response.json();
}

export async function factors(access: string) {
  await resolveSchoolSession(access);
  const user = z.object({ factors: z.array(z.unknown()).optional() }).parse(await providerRequest("/user", access));
  return (user.factors ?? []).map((factor) => factorSchema.safeParse(factor))
    .flatMap((factor) => factor.success ? [factor.data] : []);
}

export async function enrollFactor(access: string) {
  const session = await resolveSchoolSession(access);
  if (session.activePersona !== "admin") throw new ApiError("forbidden");
  const registered = await factors(access);
  if (session.assurance === "aal1") {
    if (registered.some((factor) => factor.status === "verified")) throw new ApiError("forbidden");
    const unfinished = registered.find((factor) => factor.friendly_name === authenticatorName)
      ?? registered.find((factor) => !factor.friendly_name);
    if (unfinished?.status === "unverified") {
      await providerRequest(`/factors/${unfinished.id}`, access, { method: "DELETE" });
    }
  }
  const { id, totp } = enrolledFactorSchema.parse(await providerRequest("/factors", access, {
    method: "POST",
    body: JSON.stringify({ factor_type: "totp", issuer: authenticatorName, friendly_name: authenticatorName }),
  }));
  return { id, totp: {
    secret: totp.secret, uri: totp.uri,
    qrCode: `data:image/svg+xml;base64,${Buffer.from(totp.qr_code).toString("base64")}`,
  } };
}

export async function makeChallenge(access: string, factorId: string) {
  const session = await resolveSchoolSession(access);
  if (!await factors(access).then((items) => items.some((item) => item.id === factorId))) throw new ApiError("not_found");
  const result = challengeSchema.parse(await providerRequest(`/factors/${factorId}/challenge`, access, {
    method: "POST", body: "{}",
  }));
  await withRuntime((tx) => tx`
    select app.remember_mfa_challenge(${session.sessionId}, ${result.id}, ${factorId},
      ${new Date(result.expires_at * 1000).toISOString()})
  `);
  return { challengeId: result.id };
}

export async function verifyChallenge(request: Request, access: string, challengeId: string, code: string) {
  const before = await resolveSchoolSession(access);
  const [row] = await withRuntime((tx) => tx<{ factor: string | null }[]>`
    select app.use_mfa_challenge(${before.sessionId}, ${challengeId}) as factor
  `);
  if (!row.factor) throw new ApiError("validation");
  const next = tokenResponse.parse(await providerRequest(`/factors/${row.factor}/verify`, access, {
    method: "POST", body: JSON.stringify({ challenge_id: challengeId, code }),
  }));
  const session = await resolveSchoolSession(next.access_token);
  if (session.assurance !== "aal2" || session.sessionId !== before.sessionId) throw new ApiError("forbidden");
  await withRuntime((tx) => tx`select app.confirm_admin_assurance(${session.accountId})`);
  return attachWebSession(NextResponse.json({ data: session }), next as Session, requestCookie(request, "csrf"));
}

export async function requireFreshFactor(access: string, now = Date.now()) {
  const claims = await verifiedClaims(access);
  const recent = claims.amr?.some(({ method, timestamp }) =>
    method === "totp" && timestamp * 1000 <= now && timestamp * 1000 > now - 5 * 60_000);
  if (claims.aal !== "aal2" || !recent) throw new ApiError("forbidden");
}
