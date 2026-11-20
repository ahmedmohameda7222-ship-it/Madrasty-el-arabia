import { z } from "zod";
import { pageQuerySchema, revisionSchema, schoolDateSchema } from "../http";

export const attendanceStatus = z.enum(["present","late","absent_unexcused","absent_excused"]);
const schoolClass = z.object({ id:z.uuid(),code:z.string(),nameAr:z.string(),nameDe:z.string() });
export const attendanceClasses = z.object({
  date:schoolDateSchema,classes:schoolClass.array(),
});
export const attendanceDate = z.object({date:schoolDateSchema.optional()});
export const attendancePendingQuery = pageQuerySchema.extend({date:schoolDateSchema.optional(),cursor:z.uuid().optional()});
export const attendancePendingSchema = z.object({
  date:schoolDateSchema,
  items:z.object({id:z.uuid(),classId:z.uuid(),day:schoolDateSchema,classCode:z.string(),nameAr:z.string(),nameDe:z.string(),
    rosterRevision:revisionSchema,approvalRevision:revisionSchema}).array(),
});
export const attendanceRowSchema = z.object({
  id:z.uuid(),studentId:z.uuid(),studentNumber:z.string(),displayName:z.string(),enrollmentId:z.uuid(),
  status:attendanceStatus.nullable(),revision:revisionSchema,locked:z.boolean(),confirmedArrivalAt:z.iso.datetime().nullable(),
});
export const attendanceSheetSchema = z.object({
  id:z.uuid().nullable(),classroom:schoolClass,yearId:z.uuid(),schoolDate:schoolDateSchema,
  state:z.enum(["unstarted","open","approved"]),teachingDay:z.boolean(),closedReason:z.string().nullable(),
  canMark:z.boolean(),canApprove:z.boolean(),rosterRevision:revisionSchema.nullable(),approvalRevision:revisionSchema.nullable(),
  approvedAt:z.iso.datetime().nullable(),rows:attendanceRowSchema.array(),
  counts:z.object({unmarked:z.int().nonnegative(),present:z.int().nonnegative(),late:z.int().nonnegative(),
    absent_unexcused:z.int().nonnegative(),absent_excused:z.int().nonnegative()}),
});
const selection = z.object({rowId:z.uuid(),revision:revisionSchema});
const distinct = <T extends z.ZodType<{rowId:string}>>(item:T,max:number) => item.array().max(max)
  .refine((rows)=>new Set(rows.map((row)=>row.rowId)).size===rows.length);
export const attendanceEditInput = z.object({
  edits:distinct(selection.extend({status:attendanceStatus.nullable()}),1000).refine((rows)=>rows.length>0),
});
export const attendanceBulkInput = z.object({rows:distinct(selection,1000).refine((rows)=>rows.length>0)});
export const attendanceApproveInput = z.object({approvalRevision:revisionSchema,expectedRows:distinct(selection,1000)});
export const attendanceChanges = z.object({
  applied:attendanceRowSchema.array(),skippedLocked:attendanceRowSchema.array(),
  conflicts:z.object({
    rowId:z.uuid(),reason:z.enum(["stale","locked","arrival_confirmed","outside_roster"]),current:attendanceRowSchema.nullable(),
  }).array(),
});
export type AttendanceRow = z.infer<typeof attendanceRowSchema>;
export type AttendanceSheet = z.infer<typeof attendanceSheetSchema>;
export type AttendanceChanges = z.infer<typeof attendanceChanges>;
export type AttendanceStatus = z.infer<typeof attendanceStatus>;
