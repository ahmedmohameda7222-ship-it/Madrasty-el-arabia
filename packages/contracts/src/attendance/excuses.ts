import { z } from "zod";
import { revisionSchema, schoolDateSchema } from "../http";
import { attendanceRowSchema } from "./sheets";

export const familyExcuseInput = z.object({schoolDate:schoolDateSchema,reason:z.string().trim().min(1).max(500)});
export const withdrawExcuseInput = z.object({revision:revisionSchema});
export const actualArrivalInput = z.object({revision:revisionSchema,status:z.enum(["present","late"]),confirm:z.literal(true)});
export const familyExcuseReceipt = z.object({
  id:z.uuid(),studentId:z.uuid(),schoolDate:schoolDateSchema,reason:z.string(),
  state:z.enum(["pending","withdrawn","superseded"]),revision:revisionSchema,rowRevision:revisionSchema,
  submittedAt:z.iso.datetime(),withdrawable:z.boolean(),
});
export const familyExcuseCommandReceipt = familyExcuseReceipt.omit({reason:true});
export const familyExcuseDay = z.object({
  child:z.object({id:z.uuid(),displayName:z.string()}),
  schoolDate:schoolDateSchema,teachingDay:z.boolean(),receipts:familyExcuseReceipt.array(),
});
export const familyExcuseQuery = z.object({date:schoolDateSchema.optional()});
export const attendanceRowDetail = z.object({
  sheetId:z.uuid(),classId:z.uuid(),schoolDate:schoolDateSchema,row:attendanceRowSchema,excuseReason:z.string().nullable(),
});
export const attendanceNoticePosition = z.string().regex(/^(0|[1-9]\d{0,18})$/)
  .refine((value)=>value.length<19||value<="9223372036854775807");
export const attendanceNoticeQuery = z.object({
  after:attendanceNoticePosition.optional(),stream:z.enum(["0","1"]).optional(),
});
export const attendanceNoticeBatch = z.object({
  cursor:attendanceNoticePosition,
  rows:z.object({sheetId:z.uuid(),rowId:z.uuid(),revision:revisionSchema}).array(),
});
export type AttendanceNoticeBatch = z.infer<typeof attendanceNoticeBatch>;
export type AttendanceRowDetail = z.infer<typeof attendanceRowDetail>;
export type FamilyExcuseReceipt = z.infer<typeof familyExcuseReceipt>;
