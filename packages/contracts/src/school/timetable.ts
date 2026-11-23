import { z } from "zod";
import { revisionSchema, schoolDateSchema } from "../http";

const normalizedCode = z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{0,23}$/);
const roomFields = {
  code: normalizedCode,
  nameAr: z.string().trim().min(1).max(120),
  nameDe: z.string().trim().min(1).max(120),
};
export const roomInput = z.object(roomFields);
export const roomChangeInput = roomInput.extend({ revision: revisionSchema });
export const roomSchema = roomChangeInput.extend({ id: z.uuid() });
export type TimetableRoom = z.infer<typeof roomSchema>;

const draft = z.object({
  assignmentId: z.uuid(),
  subjectId: z.uuid().optional(),
  roomId: z.uuid(),
  weekday: z.int().min(1).max(7),
  start: z.int().min(0).max(1439),
  end: z.int().min(1).max(1440),
  from: schoolDateSchema,
  untilExclusive: schoolDateSchema,
});
export const timetableDraftSlot = draft;
export const timetableReviewedSlot = draft.extend({ assignmentRevision: revisionSchema, roomRevision: revisionSchema });
export const timetableSlot = draft.extend({
  id: z.uuid(), yearId: z.uuid(), classId: z.uuid(), revision: revisionSchema, canceled: z.boolean(),
});
export const timetablePreviewInput = z.object({
  yearId: z.uuid(), slots: draft.array().min(1).max(60), editingId: z.uuid().optional(),
}).refine((value) => !value.editingId || value.slots.length === 1,{ path: ["editingId"] });
export const timetableSaveInput = z.object({
  yearId: z.uuid(), yearRevision: revisionSchema, slots: timetableReviewedSlot.array().min(1).max(60),
});
export const timetablePatchInput = z.union([
  z.object({ revision: revisionSchema, cancel: z.literal(true) }),
  z.object({ revision: revisionSchema, yearRevision: revisionSchema, slot: timetableReviewedSlot }),
  z.object({ revision: revisionSchema, date: schoolDateSchema, scope: z.enum(["single","future"]), cancel: z.literal(true) }),
  z.object({ revision: revisionSchema, yearRevision: revisionSchema, date: schoolDateSchema, scope: z.enum(["single","future"]), slot: timetableReviewedSlot }),
]);
export const timetableIssue = z.object({
  field: z.enum(["assignmentId","subjectId","roomId","weekday","start","end","from","untilExclusive","classId","staffId"]),
  kind: z.enum(["unavailable","interval","clash"]),
});
export const timetablePreviewSchema = z.object({
  yearRevision: revisionSchema,
  entries: z.object({ slot: timetableReviewedSlot.nullable(), issues: timetableIssue.array() }).array(),
  canSave: z.boolean(),
});
export const timetableSavedSchema = z.object({ ids: z.uuid().array() });
export const timetableWeekQuery = z.object({
  weekOf: schoolDateSchema.optional(),
  classId: z.uuid().optional(),
  childId: z.uuid().optional(),
});
export const timetableWeekSchema = z.object({
  weekOf: schoolDateSchema,
  timezone: z.string(),
  days: z.object({ date: schoolDateSchema, teaching: z.boolean() }).array().length(7),
  slots: z.object({
    id: z.uuid(), assignmentId: z.uuid(), classId: z.uuid(),
    classCode: z.string(), classNameAr: z.string(), classNameDe: z.string(),
    subjectNameAr: z.string(), subjectNameDe: z.string(),
    roomCode: z.string(), roomNameAr: z.string(), roomNameDe: z.string(),
    teacherName: z.string(), substitute: z.boolean(), date:schoolDateSchema, teaching: z.boolean(),
    start: z.int().min(0).max(1439), end: z.int().min(1).max(1440), revision: revisionSchema,
  }).array(),
});
export type DraftSlot = z.infer<typeof timetableDraftSlot>;
export type TimetableIssue = z.infer<typeof timetableIssue>;
export type TimetableSlot = z.infer<typeof timetableSlot>;
export type TimetablePreview = z.infer<typeof timetablePreviewSchema>;
export type TimetableWeek = z.infer<typeof timetableWeekSchema>;
