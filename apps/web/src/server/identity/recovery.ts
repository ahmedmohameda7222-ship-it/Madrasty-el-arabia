import "server-only";
import { z } from "zod";
import type { Locale, Persona } from "@madrasty/contracts";
import { ApiError } from "@/server/http";
import { withRuntime } from "@/server/db/scoped";
import { allowAuthMail } from "./authMail";
import { providerRequest, requireFreshFactor } from "./assurance";
import { authProvider, providerFailure, verifiedClaims } from "./provider";
import { providerSignOut } from "./session";

function schoolUrl(path: string) {
  if (!process.env.APP_ORIGIN) throw new ApiError("unavailable");
  return new URL(path, process.env.APP_ORIGIN).toString();
}

export async function requestRecovery(email: string, locale: Locale) {
  if (!allowAuthMail(email)) return;
  const { error } = await authProvider().resetPasswordForEmail(email, {
    redirectTo: schoolUrl(`/${locale}/account/security/recover`),
  });
  if (error && (!error.status || error.status >= 500 || error.status === 429)) providerFailure(error);
}

export async function completeRecovery(challenge: string, password: string) {
  const { data, error } = await authProvider().verifyOtp({ type: "recovery", token_hash: challenge });
  if (error) providerFailure(error);
  if (!data.session || !data.user) throw new ApiError("unauthenticated");
  const access = data.session.access_token;
  const claims = await verifiedClaims(access);
  await withRuntime((tx) => tx`select app.recover_account(${claims.sub})`);
  await providerRequest("/user", access, { method: "PUT", body: JSON.stringify({ password }) });
  await providerSignOut(access, true).catch(() => {
    console.warn("Password recovery provider global logout pending reconciliation");
  });
}

export async function requestEmailChange(
  access: string, persona: Persona, email: string, reauthPassword: string,
) {
  if (persona === "admin") await requireFreshFactor(access);
  const user = z.object({ id: z.uuid(), email: z.email() }).parse(await providerRequest("/user", access));
  if (!allowAuthMail(email) || !allowAuthMail(user.email)) throw new ApiError("forbidden");
  const auth = await authProvider().signInWithPassword({ email: user.email, password: reauthPassword });
  if (auth.error) providerFailure(auth.error);
  if (!auth.data.session || auth.data.user?.id !== user.id) throw new ApiError("unauthenticated");
  await providerSignOut(auth.data.session.access_token, false).catch(() => undefined);
  const redirect = encodeURIComponent(schoolUrl("/ar/account/security/email"));
  await providerRequest(`/user?redirect_to=${redirect}`, access, {
    method: "PUT", body: JSON.stringify({ email }),
  });
}

export async function confirmEmailChange(challenge: string) {
  const { data, error } = await authProvider().verifyOtp({ type: "email_change", token_hash: challenge });
  if (error) providerFailure(error);
  const token = data.session?.access_token;
  if (token) await providerSignOut(token, false).catch(() => undefined);
}

export async function completeInitialActivation(challenge: string, password: string) {
  const { data, error } = await authProvider().verifyOtp({ type: "magiclink", token_hash: challenge });
  if (error) providerFailure(error);
  if (!data.session || !data.user) throw new ApiError("unauthenticated");
  const token = data.session.access_token;
  try {
    const claims = await verifiedClaims(token);
    const [state] = await withRuntime((tx) => tx<{ allowed: boolean }[]>
      `select app.initial_activation_pending(${claims.sub}) as allowed`);
    if (!state.allowed) throw new ApiError("forbidden");
    await providerRequest("/user", token, { method: "PUT", body: JSON.stringify({ password }) });
    const [result] = await withRuntime((tx) => tx<{ activated: boolean }[]>
      `select app.activate_initial_admin(${claims.sub}) as activated`);
    if (!result.activated) throw new ApiError("conflict");
  } finally {
    await providerSignOut(token, false).catch(() => undefined);
  }
}
