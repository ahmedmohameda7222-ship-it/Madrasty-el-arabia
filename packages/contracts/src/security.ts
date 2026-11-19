import { z } from "zod";
import { localeSchema, revisionSchema } from "./http";

const email = z.email().max(254).transform((value) => value.toLowerCase());
const secret = z.string().min(16).max(256).regex(/^[A-Za-z0-9_-]+$/);

export const recoveryRequestInput = z.object({ email, locale: localeSchema });
export const recoveryCompleteInput = z.object({
  challenge: secret,
  newPassword: z.string().min(12).max(128),
});
export const emailChangeInput = z.object({ newEmail: email, reauthProof: z.string().min(1).max(1024) });
export const emailChangeConfirmInput = z.object({ challenge: secret });
export const mfaChallengeInput = z.object({ factorId: z.uuid() });
export const mfaVerifyInput = z.object({ challengeId: z.uuid(), code: z.string().regex(/^\d{6}$/) });
export const deactivateStaffInput = z.object({
  scope: z.enum(["staff", "account"]),
  reason: z.string().trim().min(4).max(400),
  revision: revisionSchema,
});
