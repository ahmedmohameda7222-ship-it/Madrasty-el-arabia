import { z } from "zod";
import { personaSchema } from "./http";
import { capabilitySchema } from "./capabilities";

export const signInInput = z.object({
  email: z.email().max(254).transform((email) => email.trim().toLowerCase()),
  password: z.string().min(1).max(1024),
});
export const switchPersonaInput = z.object({ persona: personaSchema });
export const signOutInput = z.object({ allDevices: z.boolean() });

export const sessionSchema = z.object({
  accountId: z.uuid(),
  sessionId: z.uuid(),
  personas: z.array(personaSchema),
  activePersona: personaSchema,
  assurance: z.enum(["aal1", "aal2"]),
  expiresAt: z.iso.datetime(),
});

export type SchoolSession = z.infer<typeof sessionSchema>;

/** Used only by the authenticated administrative server endpoint. Never persist passwords. */
export const staffClassAssignmentInput = z.object({
  classId: z.uuid(),
  kind: z.enum(["primary","subject"]),
  subjectId: z.uuid().nullable().optional(),
}).refine(value => value.kind !== "subject" || Boolean(value.subjectId), {path:["subjectId"]});

export const directStaffAccountInput = z.object({
  role: z.enum(["teacher", "admin"]),
  displayName: z.string().trim().min(1).max(200),
  email: z.email().max(254).transform((email) => email.trim().toLowerCase()),
  password: z.string().min(12).max(128),
  workPhone: z.string().trim().min(1).max(48).nullable().optional(),
  correspondenceLocale: z.enum(["ar", "de"]).default("de"),
  assignment: staffClassAssignmentInput.optional(),
  capabilities: z.array(capabilitySchema.exclude(["access.manage"])).max(12).default([])
    .refine((items) => new Set(items).size === items.length),
}).refine(value => !value.assignment || value.role === "teacher", {path:["assignment"]});
export const directStaffAccountSchema = z.object({
  accountId: z.uuid(),
  staffId: z.uuid(),
  role: z.enum(["teacher", "admin"]),
});
