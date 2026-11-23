import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { activatedInvitationSchema, batchChoiceSchema, batchOutputSchema, idempotencyKeySchema, invitationSchema,
  type activateInvitationInput, type invitationListInput, type issueBatchInput, type issueInvitationInput,
  type reissueInvitationInput, type invitationKind, type Locale,
} from "@madrasty/contracts";
import type { z } from "zod";
import { ApiError } from "@/server/http";
import { requireCapability } from "@/server/access/policies";
import { commitCommand, hashCommand, requireRevision } from "@/server/db/commands";
import { appendAudit, appendEvent } from "@/server/db/outbox";
import { withActor, withRuntime, type ActorContext, type Transaction } from "@/server/db/scoped";
import { inviteHash, sealInvite } from "./inviteDelivery";
import { authProvider, providerFailure, verifiedClaims } from "./provider";
import { providerRequest } from "./assurance";
import { providerSignOut } from "./session";

type Kind = z.infer<typeof invitationKind>;
type Target = { id: string; email: string | null; name: string; locale: Locale; connected: boolean; eligible: boolean };
const timestamp = (tx: Transaction) => tx`to_char(i.expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
const projection = (tx: Transaction) => tx`
  i.id, i.recipient_id as "recipientId", i.batch_id as "batchId", i.generation, i.kind, i.locale, i.delivery, i.email, i.revision,
  ${timestamp(tx)} as "expiresAt",
  case when i.validity = 'pending' and i.expires_at <= now() then 'expired' else i.validity end as validity
`;

const authorizeKind = (tx: Transaction, ctx: ActorContext, kind: Kind) =>
  requireCapability(tx, ctx, kind === "guardian" ? "students.manage" : "staff.invite");

async function target(tx: Transaction, kind: Kind, id: string): Promise<Target> {
  const [row] = kind === "guardian"
    ? await tx<Target[]>`select id, contact_email as email, display_name as name, correspondence_locale as locale,
      (account_id is not null) as connected, app.guardian_link_available(id) as eligible
      from app.guardian_profile where id = ${id}`
    : await tx<Target[]>`select id, email, display_name as name, correspondence_locale as locale,
      (account_id is not null) as connected, true as eligible from app.teacher_invite_contact where id = ${id}`;
  if (!row?.eligible || !row.email || row.connected) throw new ApiError("not_found");
  return row;
}

async function record(tx: Transaction, id: string) {
  const [row] = await tx`select ${projection(tx)} from app.invitation i where i.id = ${id}`;
  if (!row) throw new ApiError("not_found");
  return invitationSchema.parse(row);
}

async function issue(tx: Transaction, ctx: ActorContext, kind: Kind, adult: Target, locale: Locale, batchId: string | null) {
  await tx`select pg_advisory_xact_lock(hashtextextended(${`madrasty:invite:${kind}:${adult.id}`}, 0))`;
  const current = await target(tx, kind, adult.id);
  if (current.email !== adult.email) throw new ApiError("conflict");
  await tx`update app.invitation set validity = 'expired', sealed_token = null, sealed_proof = null, proof_hash = null, revision = revision + 1
    where kind = ${kind} and recipient_id = ${adult.id} and validity = 'pending' and expires_at <= now()`;
  const [pending] = await tx<{ id: string }[]>`
    select id from app.invitation where kind = ${kind} and recipient_id = ${adult.id} and validity = 'pending'`;
  if (pending) return { invite: await record(tx, pending.id), duplicate: true };

  const id = randomUUID();
  const token = randomBytes(32).toString("base64url");
  const [generation] = await tx<{ next: number }[]>`
    select coalesce(max(generation), 0) + 1 as next from app.invitation where kind = ${kind} and recipient_id = ${adult.id}
  `;
  const sealed = sealInvite(token, `${id}/${generation.next}`);
  await tx`insert into app.invitation (id, kind, recipient_id, batch_id, email, locale, generation, token_hash, sealed_token, delivery, created_by)
    values (${id}, ${kind}, ${adult.id}, ${batchId}, ${current.email}, ${locale}, ${generation.next},
      ${inviteHash(token)}, ${sealed}, 'queued', ${ctx.accountId})`;
  await appendAudit(tx, { action: "invitation.issued", aggregateId: id, metadata: { generation: generation.next, kind } });
  await appendEvent(tx, { type: "invitation.dispatch_requested", actorId: ctx.accountId, aggregateId: id,
    payload: { generation: generation.next, kind, recipientId: adult.id } });
  return { invite: await record(tx, id), duplicate: false };
}

export function listInvitations(ctx: ActorContext, query: z.infer<typeof invitationListInput>) {
  return withActor(ctx, async (tx) => {
    if (ctx.persona !== "admin") throw new ApiError("forbidden");
    const [capability] = await tx<{ allowed: boolean }[]>`
      select app.has_capability('students.manage') or app.has_capability('staff.invite') as allowed`;
    if (!capability.allowed) throw new ApiError("forbidden");

    const rows = invitationSchema.array().parse(await tx`
      select result.* from (
        select ${projection(tx)} from app.invitation i
        where (${query.id ?? null}::uuid is null or i.id = ${query.id ?? null}::uuid)
          and (${query.batchId ?? null}::uuid is null or i.batch_id = ${query.batchId ?? null}::uuid)
          and (${query.cursor ?? null}::uuid is null or i.id > ${query.cursor ?? null}::uuid)
      ) result where (${query.status ?? null}::text is null or result.validity = ${query.status ?? null})
      order by result.id limit ${query.limit + 1}
    `);
    return { rows: rows.slice(0, query.limit), nextCursor: rows.length > query.limit ? rows[query.limit - 1].id : undefined };
  });
}

export function issueInvitation(ctx: ActorContext, key: string | null, input: z.infer<typeof issueInvitationInput>) {
  return commitCommand(ctx, "invitation.issue", key, hashCommand(input), {
    authorize: async (tx) => { if (input.kind !== "guardian") throw new ApiError("forbidden"); await authorizeKind(tx, ctx, "guardian"); await target(tx, "guardian", input.recipientId); },
    mutate: async (tx) => (await issue(tx, ctx, input.kind, await target(tx, input.kind, input.recipientId), input.locale, null)).invite,
  });
}

type BatchPage = { limit: number; cursor?: string | null };

async function requireBatch(tx: Transaction, ctx: ActorContext, id: string) {
  await requireCapability(tx, ctx, "students.manage");
  const [batch] = await tx`select id from app.family_import_job where id = ${id} and state = 'committed'`;
  if (!batch) throw new ApiError("not_found");
}

export function batchChoices(ctx: ActorContext, id: string, page: BatchPage) {
  return withActor(ctx, async (tx) => {
    await requireBatch(tx, ctx, id);
    const rows = batchChoiceSchema.array().parse(await tx`
      select g.id, g.display_name as name, g.contact_email as email, g.correspondence_locale as locale
      from app.family_import_recipient r join app.guardian_profile g on g.id = r.guardian_id
      where r.job_id = ${id} and g.account_id is null and g.contact_email is not null
        and app.guardian_link_available(g.id) and (${page.cursor ?? null}::uuid is null or g.id > ${page.cursor ?? null}::uuid)
      order by g.id limit ${page.limit + 1}
    `);
    return { rows: rows.slice(0, page.limit), nextCursor: rows.length > page.limit ? rows[page.limit - 1].id : undefined };
  });
}

export function issueBatch(ctx: ActorContext, key: string | null, input: z.infer<typeof issueBatchInput>) {
  return commitCommand(ctx, "invitation.batch_issue", key, hashCommand(input), {
    authorize: async (tx) => {
      await requireBatch(tx, ctx, input.committedBatchId);
      const selected = await tx`select guardian_id from app.family_import_recipient
        where job_id = ${input.committedBatchId} and guardian_id = any(${tx.array(input.recipientIds)}::uuid[])`;
      if (selected.length !== input.recipientIds.length) throw new ApiError("not_found");
      for (const recipient of input.recipientIds) await target(tx, "guardian", recipient);
    },
    mutate: async (tx) => {
      let issued = 0;
      let alreadyPending = 0;
      for (const id of [...input.recipientIds].sort()) {
        const item = await target(tx, "guardian", id);
        const response = await issue(tx, ctx, "guardian", item, item.locale, input.committedBatchId);
        if (response.duplicate) alreadyPending++; else issued++;
      }
      const operationId = randomUUID();
      await appendAudit(tx, { action: "invitation.batch_requested", aggregateId: operationId,
        metadata: { batchId: input.committedBatchId, issued, alreadyPending } });
      return batchOutputSchema.parse({ operationId, issued, alreadyPending });
    },
  });
}

export function reissueInvitation(ctx: ActorContext, id: string, key: string | null, input: z.infer<typeof reissueInvitationInput>) {
  return commitCommand(ctx, "invitation.reissue", key, hashCommand({ id, ...input }), {
    authorize: async (tx) => {
      const found = await record(tx, id);
      await authorizeKind(tx, ctx, found.kind);
      await target(tx, found.kind, found.recipientId);
    },
    mutate: async (tx) => {
      const before = await record(tx, id);
      await tx`select pg_advisory_xact_lock(hashtextextended(${`madrasty:invite:${before.kind}:${before.recipientId}`}, 0))`;
      const found = await record(tx, id);
      requireRevision(found.revision, input.revision);
      if (!["pending", "expired"].includes(found.validity)) throw new ApiError("conflict");
      const adult = await target(tx, found.kind, found.recipientId);
      if (input.correctedEmail) {
        const corrected = input.correctedEmail.toLowerCase();
        if (found.kind === "guardian") {
          const [changed] = await tx`update app.guardian_profile set contact_email = ${corrected}, revision = revision + 1
            where id = ${adult.id} and account_id is null returning id`;
          if (!changed) throw new ApiError("conflict");
        } else {
          const [changed] = await tx`update app.teacher_invite_contact set email = ${corrected}
            where id = ${adult.id} and account_id is null returning id`;
          if (!changed) throw new ApiError("conflict");
        }
      }
      await tx`update app.invitation set validity = 'replaced', sealed_token = null, sealed_proof = null, proof_hash = null, revision = revision + 1
        where kind = ${found.kind} and recipient_id = ${adult.id} and (id = ${id} or validity = 'pending')`;
      return (await issue(tx, ctx, found.kind, await target(tx, found.kind, adult.id), found.locale, found.batchId)).invite;
    },
  });
}

export async function claimInvite(access: string, token: string, idempotencyKey: string | null) {
  const key = idempotencyKeySchema.safeParse(idempotencyKey);
  if (!key.success) throw new ApiError("invalid_idempotency_key");
  const context = await verifiedClaims(access);
  const [accepted] = await withRuntime((tx) => tx<{ account_id: string; persona: Kind }[]>`
    select * from app.claim_invitation(${inviteHash(token)}, ${context.sub}, ${context.session_id}, ${key.data})
  `);
  if (!accepted) throw new ApiError("not_found");
  return activatedInvitationSchema.parse({ accountId: accepted.account_id, persona: accepted.persona });
}

export async function activateInvite(input: z.infer<typeof activateInvitationInput>, key: string | null) {
  if (!idempotencyKeySchema.safeParse(key).success) throw new ApiError("invalid_idempotency_key");
  const [pending] = await withRuntime((tx) => tx<{ email: string }[]>`
    select * from app.activation_target(${inviteHash(input.token)}, ${inviteHash(input.proof)})
  `);
  if (!pending) throw new ApiError("not_found");
  const { data, error } = await authProvider().verifyOtp({ type: "invite", token_hash: input.proof });
  if (error) providerFailure(error);
  if (!data.session || data.user?.email?.toLowerCase() !== pending.email) throw new ApiError("forbidden");
  const access = data.session.access_token;
  await providerRequest("/user", access, { method: "PUT", body: JSON.stringify({ password: input.password }) });
  const accepted = await claimInvite(access, input.token, key);
  await providerSignOut(access, false).catch(() => undefined);
  return accepted;
}

/** Invitation status shown inside a guardian's family record. */
export function listGuardianInvitations(ctx: ActorContext, guardianId: string) {
  return withActor(ctx, async tx => {
    await requireCapability(tx, ctx, "students.manage");
    const [adult] = await tx`select id from app.guardian_profile where id=${guardianId}`;
    if (!adult) throw new ApiError("not_found");
    return invitationSchema.array().parse(await tx`
      select ${projection(tx)} from app.invitation i
      where i.kind='guardian' and i.recipient_id=${guardianId}
      order by i.generation desc, i.id desc limit 15
    `);
  });
}
