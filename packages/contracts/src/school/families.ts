import { z } from "zod";
import { localeSchema, pageQuerySchema, revisionSchema } from "../http";

const name = z.string().trim().min(1).max(200);
const reason = z.string().trim().min(1).max(400);
const source = z.object({ namespace: z.string().trim().min(1).max(80), key: z.string().trim().min(1).max(160) });
const studentState = z.enum(["active", "inactive"]);
export const studentSchema = z.object({
  id: z.uuid(), studentNumber: z.string().regex(/^MA-\d{6,}$/), displayName: name,
  state: studentState, revision: revisionSchema,
});
export const createStudentInput = z.object({ displayName: name, source: source.optional() });
export const updateStudentInput = z.object({ displayName: name, state: studentState, revision: revisionSchema });

const contact = z.object({
  displayName: name,
  contactEmail: z.email().max(254).transform((value) => value.toLowerCase()).nullable(),
  contactPhone: z.string().trim().min(1).max(48).nullable(),
  correspondenceLocale: localeSchema,
});
export const guardianSchema = contact.extend({
  id: z.uuid(), linkedAccount: z.boolean(), revision: revisionSchema,
});
export const createGuardianInput = contact.extend({ source: source.optional() });
export const updateGuardianInput = contact.extend({ revision: revisionSchema });
export const childLinkSchema = z.object({
  id: z.uuid(), guardianId: z.uuid(), studentId: z.uuid(), state: z.enum(["pending", "approved", "revoked"]),
  studentName: name, studentNumber: z.string(), reason: z.string(), revision: revisionSchema,
});
export const guardianDetailSchema = guardianSchema.extend({ links: childLinkSchema.array() });
export const createLinkInput = z.object({ guardianId: z.uuid(), studentId: z.uuid(), approvalReason: reason.optional() });
export const changeLinkInput = z.object({ revision: revisionSchema, reason });

export const familyQuerySchema = pageQuerySchema.extend({
  query: z.string().trim().max(120).optional(),
  cursor: z.uuid().optional(),
});
export const childSummarySchema = studentSchema.pick({ id: true, studentNumber: true, displayName: true }).extend({
  currentClass: z.object({ id: z.uuid(), code: z.string(), nameAr: z.string(), nameDe: z.string() }).nullable().optional(),
});

export type Student = z.infer<typeof studentSchema>;
export type Guardian = z.infer<typeof guardianSchema>;
export type ChildLink = z.infer<typeof childLinkSchema>;
