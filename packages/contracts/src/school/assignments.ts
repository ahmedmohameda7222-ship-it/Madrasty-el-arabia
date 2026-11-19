import { z } from "zod";
import { pageQuerySchema, personaSchema, revisionSchema, schoolDateSchema } from "../http";

export const assignmentActions = ["attendance.read","attendance.mark","attendance.approve","academics.plan","academics.log","academics.grade","academics.publish","comms.class"] as const;
export const assignmentActionSchema = z.enum(assignmentActions);
export const staffRoleSchema = z.enum(["teacher","principal","deputy","office"]);
const text = (length: number) => z.string().trim().min(1).max(length);
const caps = z.array(assignmentActionSchema).min(1).max(assignmentActions.length)
  .refine((values) => values.length === new Set(values).size);

const profile = z.object({
  displayName: text(200), role: staffRoleSchema, titleAr: text(120), titleDe: text(120),
  workEmail: z.email().max(254).nullable(), workPhone: text(48).nullable(), accountId: z.uuid().nullable(),
  activeFrom: schoolDateSchema, activeUntil: schoolDateSchema.nullable(),
});
const window = <T extends z.ZodType<{ from: string; untilExclusive: string }>>(schema: T) =>
  schema.refine(({ from, untilExclusive }) => from < untilExclusive, { path: ["untilExclusive"] });
export const staffInput = profile.refine(({ activeFrom, activeUntil }) => !activeUntil || activeUntil > activeFrom, { path: ["activeUntil"] });
export const staffChangeInput = profile.extend({ revision: revisionSchema })
  .refine(({ activeFrom, activeUntil }) => !activeUntil || activeUntil > activeFrom, { path: ["activeUntil"] });
export const staffSchema = profile.extend({ id: z.uuid(), revision: revisionSchema, disabled: z.boolean() });

export const staffListInput = pageQuerySchema.extend({ query: z.string().trim().max(120).optional(), cursor: z.uuid().optional() });
export const staffAccountSchema = z.object({ accountId: z.uuid(), displayName: z.string(), roles: personaSchema.array() });
export const subjectSchema = z.object({ id: z.uuid(), code: z.string(), nameAr: z.string(), nameDe: z.string() });
const range = z.object({ from: schoolDateSchema, untilExclusive: schoolDateSchema, capabilities: caps });
const assignment = range.extend({ staffId: z.uuid(), kind: z.enum(["primary","subject"]), subjectId: z.uuid().nullable() });
export const assignmentInput = window(assignment).refine((entry) => (entry.kind === "subject") === Boolean(entry.subjectId), { path: ["subjectId"] });
export const assignmentSchema = assignment.extend({
  id: z.uuid(), classId: z.uuid(), offeringId: z.uuid().nullable(), revision: revisionSchema,
  staffName: z.string(), revoked: z.boolean(),
  classCode: z.string(), classNameAr: z.string(), classNameDe: z.string(),
  subjectNameAr: z.string().nullable(), subjectNameDe: z.string().nullable(),
});
export const assignmentChangeInput = z.object({
  revision: revisionSchema,
  untilExclusive: schoolDateSchema.optional(),
  replacement: z.object({ staffId: z.uuid(), from: schoolDateSchema, capabilities: caps }).optional(),
  revoke: z.boolean().optional(),
}).refine((input) => Boolean(input.untilExclusive || input.replacement || input.revoke));
export const substituteInput = window(range.extend({ staffId: z.uuid(), revision: revisionSchema }));
export const substituteSchema = range.extend({
  id: z.uuid(), staffId: z.uuid(), assignmentId: z.uuid(), revision: revisionSchema,
  staffName: z.string(), revoked: z.boolean(),
});
export const assignmentWithSubstitutesSchema = assignmentSchema.extend({ substitutes: substituteSchema.array() });
export const teachingViewSchema = assignmentSchema.extend({ substitute: z.boolean() });
export type Assignment = z.infer<typeof assignmentSchema>;
export type StaffProfile = z.infer<typeof staffSchema>;
