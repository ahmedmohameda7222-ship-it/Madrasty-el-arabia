import { z } from "zod";
import { pageQuerySchema, revisionSchema, schoolDateSchema } from "../http";
import { studentSchema } from "./families";

const label = z.string().trim().min(1).max(120);
const classFields = z.object({ nameAr: label, nameDe: label, capacity: z.int().min(1).max(1000).nullable() });
export const classInput = classFields.extend({ yearId: z.uuid(), code: z.string().regex(/^[A-Z0-9][A-Z0-9_-]{0,23}$/) });
export const classChangeInput = classFields.extend({ revision: revisionSchema });
export const schoolClassSchema = classInput.extend({ id: z.uuid(), revision: revisionSchema });
export type SchoolClass = z.infer<typeof schoolClassSchema>;
export const classListing = pageQuerySchema.extend({ yearId: z.uuid().optional(), cursor: z.uuid().optional() });
export const enrollmentSchema = z.object({
  id: z.uuid(), classId: z.uuid(), studentId: z.uuid(), yearId: z.uuid(),
  effectiveFrom: schoolDateSchema, effectiveUntil: schoolDateSchema,
  endingReason: z.string().nullable(), revision: revisionSchema, voided: z.boolean(),
});
export type Enrollment = z.infer<typeof enrollmentSchema>;
export const placeStudentsInput = z.object({
  studentIds: z.array(z.uuid()).min(1).max(100).refine((ids) => ids.length === new Set(ids).size),
  from: schoolDateSchema, revision: revisionSchema,
});
export const rosterRowSchema = studentSchema.pick({ displayName: true, studentNumber: true }).extend({
  enrollment: enrollmentSchema,
});
export const enrollmentMoveInput = z.object({
  effectiveDate: schoolDateSchema, toClassId: z.uuid().optional(),
  reason: z.string().trim().min(1).max(400), revision: revisionSchema,
});
const mapping = z.object({ fromClassId: z.uuid(), toClassId: z.uuid() });
const override = z.object({ studentId: z.uuid(), action: z.enum(["repeat","withdraw","skip","target"]), toClassId: z.uuid().optional() });
export const rolloverInput = z.object({
  targetYearId: z.uuid(), classMap: z.array(mapping).max(250), exceptions: z.array(override).max(250),
}).superRefine((value, context) => {
  if (new Set(value.classMap.map(({ fromClassId }) => fromClassId)).size !== value.classMap.length)
    context.addIssue({ code: "custom", path: ["classMap"], message: "duplicate mapping" });
  if (new Set(value.exceptions.map(({ studentId }) => studentId)).size !== value.exceptions.length)
    context.addIssue({ code: "custom", path: ["exceptions"], message: "duplicate override" });
  if (value.exceptions.some((row) => (row.action === "target" || row.action === "repeat") !== Boolean(row.toClassId)))
    context.addIssue({ code: "custom", path: ["exceptions"], message: "invalid target" });
});
export const rolloverRowSchema = z.object({
  studentId: z.uuid(), displayName: label, enrollmentId: z.uuid(), enrollmentRevision: revisionSchema,
  classId: z.uuid(), targetClassId: z.uuid().nullable(), targetClassRevision: revisionSchema.nullable(),
  action: z.enum(["place","repeat","withdraw","skip","target"]), conflict: z.string().nullable(),
});
export const rolloverPreviewSchema = z.object({
  id: z.uuid(), revision: revisionSchema, sourceYearId: z.uuid(), targetYearId: z.uuid(),
  confirmed: z.boolean(),
  rows: rolloverRowSchema.array(),
  counts: z.object({ changes: z.int(), conflicts: z.int(), noPlacement: z.int() }),
});
