import "server-only";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { applicationSchema, type applicantVerifyInput, type applicationDecisionInput, type applicationInput,
  type applicationListInput, type Locale } from "@madrasty/contracts";
import type { z } from "zod";
import { ApiError } from "@/server/http";
import { requireCapability } from "@/server/access/policies";
import { commitCommand, hashCommand } from "@/server/db/commands";
import { appendAudit, appendEvent } from "@/server/db/outbox";
import { withActor, withRuntime, type ActorContext, type Transaction } from "@/server/db/scoped";
import { authProvider, providerFailure, verifiedClaims } from "./provider";
import { allowAuthMail } from "./authMail";
import { providerRequest } from "./assurance";
import { assertWebMutation, providerSignOut, requestCookie, requestCredential } from "./session";

const secure = () => process.env.NODE_ENV === "production";
const cookie = (name: string) => `${secure() ? "__Host-" : ""}madrasty-${name}`;

export async function requestApplicantEmail(email: string, locale: Locale) {
  if (!allowAuthMail(email)) return;
  const origin = process.env.APP_ORIGIN;
  if (!origin) throw new ApiError("unavailable");
  await withRuntime((tx) => tx`select app.record_applicant_intake(${email}, ${locale})`);
  const redirect = new URL(`/${locale}/apply/verify`, origin).toString();
  const { error } = await authProvider(true).admin.inviteUserByEmail(email, { redirectTo: redirect });
  // Auth sends only from the configured provider. The response does not reveal existing accounts.
  if (error && (!error.status || error.status >= 500 || error.status === 429)) providerFailure(error);
}

export async function verifyApplicantEmail(input: z.infer<typeof applicantVerifyInput>) {
  const { data, error } = await authProvider().verifyOtp({ type: "invite", token_hash: input.proof });
  if (error) providerFailure(error);
  if (!data.session) throw new ApiError("unauthenticated");
  const token = data.session.access_token;
  try {
    const claims = await verifiedClaims(token);
    const [allowed] = await withRuntime((tx) => tx<{ eligible: boolean }[]>`
      select app.applicant_can_activate(${claims.sub}, ${claims.session_id}) as eligible
    `);
    if (!allowed.eligible) throw new ApiError("forbidden");
    await providerRequest("/user", token, { method: "PUT", body: JSON.stringify({ password: input.password }) });
    await activateApplicant(token, true);
  } finally {
    await providerSignOut(token, false).catch(() => undefined);
  }
}

async function activateApplicant(token: string, initialize = false) {
  const claims = await verifiedClaims(token);
  const [account] = await withRuntime((tx) => tx<{ id: string | null }[]>`
    select app.applicant_identity(${claims.sub}, ${claims.session_id}, ${initialize}) as id
  `);
  if (!account.id) throw new ApiError("unauthenticated");
  return claims;
}

export async function applicantSignIn(request: Request, email: string, password: string) {
  const { data, error } = await authProvider().signInWithPassword({ email, password });
  if (error) providerFailure(error);
  if (!data.session) throw new ApiError("unauthenticated");
  const access = data.session.access_token;
  try {
    const claim = await activateApplicant(access, true);
    const current = requestCookie(request, "session");
    if (current) {
      const previous = await verifiedClaims(current).catch(() => null);
      if (previous && previous.sub !== claim.sub) throw new ApiError("forbidden");
    }
    const response = NextResponse.json({ data: { accepted: true } });
    response.cookies.set(cookie("application"), access,
      { path: "/", secure: secure(), httpOnly: true, sameSite: "lax", maxAge: Math.max(1, data.session.expires_in) });
    response.cookies.set(cookie("csrf"), requestCookie(request, "csrf") ?? randomBytes(32).toString("hex"),
      { path: "/", secure: secure(), httpOnly: false, sameSite: "lax", maxAge: Math.max(1, data.session.expires_in) });
    return response;
  } catch (cause) {
    await providerSignOut(access, false).catch(() => undefined);
    throw cause;
  }
}

export async function endApplicantSession(request: Request) {
  const access = requestCookie(request, "application");
  if (access) await providerSignOut(access, false).catch(() => undefined);
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(cookie("application"), "",
    { path: "/", secure: secure(), httpOnly: true, sameSite: "lax", maxAge: 0 });
  return response;
}

async function applicant(request: Request) {
  if (request.headers.get("authorization")) return verifiedClaims(requestCredential(request).token);
  if (!["GET","HEAD"].includes(request.method)) assertWebMutation(request, true);
  if (requestCookie(request, "locked")) throw new ApiError("unauthenticated");
  const credentials = requestCookie(request, "application") ?? requestCredential(request).token;
  return verifiedClaims(credentials);
}

export async function myApplication(request: Request) {
  const claims = await applicant(request);
  const [entry] = await withRuntime((tx) => tx<{ details: unknown }[]>`
    select app.my_application(${claims.sub}, ${claims.session_id}) as details
  `);
  return entry.details == null ? null : applicationSchema.parse(entry.details);
}

export async function submitApplication(request: Request, input: z.infer<typeof applicationInput>) {
  const claims = await applicant(request);
  const [saved] = await withRuntime((tx) => tx<{ details: unknown }[]>`
    select app.submit_application(${claims.sub}, ${claims.session_id}, ${tx.json(input)}) as details
  `);
  return applicationSchema.parse(saved.details);
}

export function listApplications(actor: ActorContext, input: z.infer<typeof applicationListInput>) {
  return withActor(actor, async (tx) => {
    await requireCapability(tx, actor, "applications.manage");
    const rows = await tx<{ details: unknown }[]>`
      select app.application_view(a) as details from app.teacher_application a
      where (${input.status ?? null}::text is null or a.state = ${input.status ?? null})
        and (${input.cursor ?? null}::uuid is null or a.id > ${input.cursor ?? null}::uuid)
      order by a.id limit ${input.limit + 1}
    `;
    const items = applicationSchema.array().parse(rows.map(({ details }) => details));
    return { rows: items.slice(0, input.limit), nextCursor: items.length > input.limit ? items[input.limit - 1].id : undefined };
  });
}

async function allowDecision(tx: Transaction, ctx: ActorContext, id: string) {
  await requireCapability(tx, ctx, "applications.manage");
  const [row] = await tx`select id from app.teacher_application where id = ${id}`;
  if (!row) throw new ApiError("not_found");
}

export function decideApplication(
  ctx: ActorContext, id: string, key: string | null, input: z.infer<typeof applicationDecisionInput>,
) {
  return commitCommand(ctx, "teacher.application.decide", key, hashCommand({ id, ...input }), {
    authorize: (tx) => allowDecision(tx, ctx, id),
    mutate: async (tx) => {
      const [entry] = await tx<{ result: (Record<string, unknown> & { stale?: boolean; applicantId?: string }) | null }[]>`
        select app.decide_application(${id}, ${input.revision}, ${input.decision}, ${input.applicantMessage ?? null}) as result
      `;
      if (!entry.result) throw new ApiError("not_found");
      if (entry.result.stale) throw new ApiError("stale_revision");
      const result = applicationSchema.parse(entry.result);
      await appendAudit(tx, { action: "teacher_application.decided", aggregateId: id,
        metadata: { decision: result.state, revision: result.revision } });
      await appendEvent(tx, { type: "teacher_application.decided", actorId: ctx.accountId, aggregateId: id,
        payload: { applicantId: entry.result.applicantId ?? null, decision: result.state, revision: result.revision } });
      return result;
    },
  });
}
