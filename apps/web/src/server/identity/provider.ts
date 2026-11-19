import "server-only";
import { createClient, type AuthError } from "@supabase/supabase-js";
import { z } from "zod";
import { ApiError } from "@/server/http";

const claimsSchema = z.object({
  iss: z.string(),
  aud: z.union([z.literal("authenticated"), z.array(z.string()).refine((aud) => aud.includes("authenticated"))]),
  role: z.literal("authenticated"),
  sub: z.uuid(),
  session_id: z.uuid(),
  exp: z.number().int(),
  aal: z.enum(["aal1", "aal2"]),
  amr: z.array(z.object({ method: z.string(), timestamp: z.number() })).optional(),
  is_anonymous: z.literal(false).optional(),
});

export function authProvider(admin = false) {
  const url = process.env.SUPABASE_URL;
  const key = admin ? process.env.SUPABASE_AUTH_ADMIN_KEY : process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new ApiError("unavailable");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false, flowType: "pkce" },
  }).auth;
}

export type Claims = z.infer<typeof claimsSchema>;

export async function verifiedClaims(token: string): Promise<Claims> {
  const checked = await authProvider().getClaims(token);
  if (checked.error) providerFailure(checked.error);
  const parsed = claimsSchema.safeParse(checked.data?.claims);
  const issuer = process.env.SUPABASE_URL?.replace(/\/$/, "") + "/auth/v1";
  if (!parsed.success || parsed.data.iss !== issuer || parsed.data.exp * 1000 <= Date.now()) {
    throw new ApiError("unauthenticated");
  }
  return parsed.data;
}

export function providerFailure(error: AuthError): never {
  if (error.status === 429) throw new ApiError("throttled");
  if (!error.status || error.status >= 500) throw new ApiError("unavailable");
  throw new ApiError("unauthenticated");
}
