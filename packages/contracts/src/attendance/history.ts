import { z } from "zod";
import { pageQuerySchema, revisionSchema, schoolDateSchema } from "../http";
import { attendanceRowSchema, attendanceStatus } from "./sheets";

const ranges = pageQuerySchema.extend({
  from:schoolDateSchema.optional(),to:schoolDateSchema.optional(),cursor:z.string().max(220).optional(),
});
function ordered(value:{from?:string;to?:string}) {
  return !value.from||!value.to||value.from<=value.to;
}
export const childAttendanceQuery = ranges.refine(ordered,{path:["to"]});
export const staffAttendanceQuery = ranges.extend({
  classId:z.uuid().optional(),status:z.union([attendanceStatus,z.literal("cancelled")]).optional(),
}).refine(ordered,{path:["to"]});
export const approvedAttendanceEntry = z.object({
  id:z.uuid(),studentId:z.uuid(),studentName:z.string(),studentNumber:z.string(),classId:z.uuid(),
  classCode:z.string(),classNameAr:z.string(),classNameDe:z.string(),schoolDate:schoolDateSchema,
  status:attendanceStatus.nullable(),revision:revisionSchema,cancelled:z.boolean(),
});
export const familyAttendanceHistory = z.object({
  entries:approvedAttendanceEntry.array(),
  ownPreliminary:z.object({id:z.uuid(),schoolDate:schoolDateSchema,submittedAt:z.iso.datetime()}).array(),
});
export const attendanceRevisionHistory = z.object({
  row:attendanceRowSchema,sheetId:z.uuid(),classId:z.uuid(),schoolDate:schoolDateSchema,
  calendarCancelled:z.boolean(),approvalRevision:revisionSchema,canCorrect:z.boolean(),canCancel:z.boolean(),
  revisions:z.object({
    id:z.uuid(),kind:z.enum(["approval","correction","calendar_cancellation"]),revision:revisionSchema,
    priorStatus:attendanceStatus.nullable(),status:attendanceStatus,actorName:z.string().nullable(),
    occurredAt:z.iso.datetime(),reason:z.string().nullable(),
  }).array(),
});
const reason = z.string().trim().min(1).max(500);
export const attendanceCorrectionInput = z.object({revision:revisionSchema,status:attendanceStatus,reason});
export const attendanceCancellationInput = z.object({approvalRevision:revisionSchema,reason});
export const attendanceCorrectionSchema = z.object({
  rowId:z.uuid(),classId:z.uuid(),schoolDate:schoolDateSchema,status:attendanceStatus,revision:revisionSchema,calendarCancelled:z.boolean(),
});
export const attendanceCancellationSchema = z.object({
  classId:z.uuid(),schoolDate:schoolDateSchema,calendarCancelled:z.literal(true),correctedRows:z.int().nonnegative(),
});
export type ApprovedAttendanceEntry = z.infer<typeof approvedAttendanceEntry>;
export type AttendanceRevisionHistory = z.infer<typeof attendanceRevisionHistory>;
