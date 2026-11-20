import { z } from "zod";
import { pageQuerySchema,revisionSchema,schoolDateSchema } from "../http";

const id=z.uuid(), optionalLink=id.nullable().optional();
const factScore=z.number().min(0).max(1000000).multipleOf(.0001);
export const teachingLogQuery=pageQuerySchema.extend({offeringId:id.optional()});
export const activityQuery=teachingLogQuery.extend({childId:id.optional()});
const teachingDraft=z.object({
  assignmentId:optionalLink,lessonId:optionalLink,lessonVersionId:optionalLink,
  actualDate:schoolDateSchema,deliveredNotes:z.string().trim().min(1).max(12000),
});
export const teachingLogCreate=teachingDraft.extend({offeringId:id});
export const teachingLogChange=teachingDraft.extend({revision:revisionSchema});
export const teachingAssignmentsQuery=z.object({offeringId:id,date:schoolDateSchema});
export const teachingAssignmentChoice=z.object({id,teacherName:z.string()});
export const teachingEntry=z.object({
  id,offeringId:id,assignmentId:id,lessonId:id.nullable(),lessonVersionId:id.nullable(),
  actualDate:schoolDateSchema,deliveredNotes:z.string(),recordedAt:z.iso.datetime(),recordedByName:z.string().nullable(),
  revision:revisionSchema,canEdit:z.boolean(),plannedDate:schoolDateSchema.nullable(),
  planTitleAr:z.string().nullable(),planTitleDe:z.string().nullable(),
});
export const activityCreate=z.object({
  offeringId:id,date:schoolDateSchema,title:z.string().trim().min(1).max(200),maxScore:factScore.min(.0001),
});
export const activityEntry=z.object({
  id,offeringId:id,date:schoolDateSchema,title:z.string(),maxScore:factScore,score:factScore.nullable(),
  markId:id.nullable(),markRevision:revisionSchema.nullable(),classId:id,classCode:z.string(),
  subjectNameAr:z.string(),subjectNameDe:z.string(),canEdit:z.boolean(),
});
export const activityMarkInput=z.object({
  revision:revisionSchema,score:factScore.nullable(),reasonIfCorrection:z.string().trim().min(1).max(500).optional(),
});
export const activityRosterQuery=pageQuerySchema.extend({cursor:id.optional()});
export const activityRosterRow=z.object({
  studentId:id,studentName:z.string(),studentNumber:z.string(),enrollmentId:id,
  score:factScore.nullable(),markId:id.nullable(),revision:revisionSchema,visible:z.boolean(),
});
export const activityMarkReceipt=z.object({
  markId:id.nullable(),score:factScore.nullable(),revision:revisionSchema,changed:z.boolean(),correction:z.boolean(),
});
export const activityHistoryRow=z.object({
  revision:revisionSchema,previousScore:factScore.nullable(),score:factScore.nullable(),
  actorName:z.string().nullable(),occurredAt:z.iso.datetime(),reason:z.string(),
});
export type TeachingEntry=z.infer<typeof teachingEntry>;
export type ActivityEntry=z.infer<typeof activityEntry>;
export type ActivityRosterRow=z.infer<typeof activityRosterRow>;
