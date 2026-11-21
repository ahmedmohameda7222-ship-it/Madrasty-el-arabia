import { z } from "zod";
import { revisionSchema, schoolDateSchema } from "../http";

const text = (max: number) => z.string().trim().min(1).max(max);
const initialRevision = z.int().min(0);
const weekdays = z.array(z.int().min(1).max(7)).min(1).max(7)
  .refine((days) => new Set(days).size === days.length);
export const yearStateSchema = z.enum(["draft", "active", "closed"]);

const settingsFields = z.object({
  timezone: text(128),
  nameAr: text(200),
  nameDe: text(200),
  currency: z.string().regex(/^[A-Z]{3}$/),
  dueDay: z.int().min(1).max(31),
});
export const settingsSchema = settingsFields.extend({ revision: revisionSchema });
export const settingsInput = settingsFields.extend({ revision: initialRevision });
export type Settings = z.infer<typeof settingsSchema>;

const yearFields = z.object({
  startsOn: schoolDateSchema, endsExclusive: schoolDateSchema,
  teachingWeekdays: weekdays, state: yearStateSchema,
});
const orderedYear = <T extends z.ZodType<{ startsOn: string; endsExclusive: string }>>(schema: T) =>
  schema.refine((value) => value.startsOn < value.endsExclusive, { path: ["endsExclusive"] });
export const yearInput = orderedYear(yearFields);
export const yearChangeInput = orderedYear(yearFields.extend({ revision: revisionSchema }));
export const yearSchema = yearFields.extend({ id: z.uuid(), revision: revisionSchema });
export type SchoolYear = z.infer<typeof yearSchema>;

const dayFields = z.object({ classId: z.uuid().nullable().optional(), teaching: z.boolean(), reason: text(400) });
export const dayInput = dayFields.extend({ revision: initialRevision });
export const dayExceptionSchema = dayFields.extend({
  id: z.uuid(), yearId: z.uuid(), schoolDate: schoolDateSchema, revision: revisionSchema,
});
export const daysSchema = z.array(dayExceptionSchema);
