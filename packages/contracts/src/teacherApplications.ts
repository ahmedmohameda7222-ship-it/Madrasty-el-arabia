import { z } from "zod";
import { localeSchema, pageQuerySchema, revisionSchema } from "./http";
import { providerInviteProof } from "./invitations";

const mailAddress = z.email().max(254).transform((value) => value.toLowerCase());
export const applicantEmailInput = z.object({ email: mailAddress, locale: localeSchema });
export const applicantVerifyInput = z.object({ proof: providerInviteProof, password: z.string().min(12).max(128) });
export const applicationStatus = z.enum(["submitted", "approved", "declined"]);
export const applicationInput = z.object({
  displayName: z.string().trim().min(1).max(200), correspondenceLocale: localeSchema,
  workContact: z.string().trim().min(1).max(180).optional(),
  requestedSubjects: z.array(z.string().trim().min(1).max(100)).max(10).optional(),
});
export const applicationSchema = applicationInput.extend({
  id: z.uuid(), state: applicationStatus, revision: revisionSchema,
  submittedAt: z.iso.datetime(), decidedAt: z.iso.datetime().nullable(),
  applicantMessage: z.string().nullable(),
  decisionNotice: z.object({id:z.uuid(),createdAt:z.iso.datetime()}).optional(),
});
export const applicationListInput = pageQuerySchema.extend({
  status: applicationStatus.optional(), cursor: z.uuid().optional(),
});
export const applicationDecisionInput = z.object({
  decision: z.enum(["approved","declined"]), revision: revisionSchema,
  applicantMessage: z.string().trim().min(1).max(1200).optional(),
});
export type TeacherApplication = z.infer<typeof applicationSchema>;
