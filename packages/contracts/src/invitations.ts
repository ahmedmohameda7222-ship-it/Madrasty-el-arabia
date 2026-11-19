import { z } from "zod";
import { localeSchema, pageQuerySchema, personaSchema, revisionSchema } from "./http";

export const invitationKind = z.enum(["guardian", "teacher"]);
export const invitationState = z.enum(["pending", "expired", "replaced", "revoked", "activated"]);
export const invitationDelivery = z.enum(["ready", "queued", "sent", "bounced"]);
export const invitationToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const providerInviteProof = z.string().regex(/^[A-Za-z0-9_-]{16,256}$/);
export const invitationSchema = z.object({
  id: z.uuid(), recipientId: z.uuid(), batchId: z.uuid().nullable(), generation: z.int().positive(),
  kind: invitationKind, locale: localeSchema, delivery: invitationDelivery, validity: invitationState,
  email: z.email(), expiresAt: z.iso.datetime(), revision: revisionSchema,
});
export const invitationListInput = pageQuerySchema.extend({
  batchId: z.uuid().optional(), status: invitationState.optional(), cursor: z.uuid().optional(),
});
export const issueInvitationInput = z.object({ recipientId: z.uuid(), kind: invitationKind, locale: localeSchema });
export const issueTeacherInput = z.object({
  name: z.string().trim().min(1).max(200), email: z.email().max(254).transform((value) => value.toLowerCase()), locale: localeSchema,
});
export const issueBatchInput = z.object({
  committedBatchId: z.uuid(),
  recipientIds: z.array(z.uuid()).min(1).max(100).refine((ids) => new Set(ids).size === ids.length),
});
export const batchChoiceSchema = z.object({ id: z.uuid(), name: z.string(), email: z.email(), locale: localeSchema });
export const batchOutputSchema = z.object({ operationId: z.uuid(), issued: z.int(), alreadyPending: z.int() });
export const reissueInvitationInput = z.object({ revision: revisionSchema, correctedEmail: z.email().max(254).optional() });
export const redeemInvitationInput = z.object({ token: invitationToken });
export const activateInvitationInput = redeemInvitationInput.extend({
  proof: providerInviteProof, password: z.string().min(12).max(128),
});
export const activatedInvitationSchema = z.object({ accountId: z.uuid(), persona: personaSchema });
export type Invitation = z.infer<typeof invitationSchema>;
