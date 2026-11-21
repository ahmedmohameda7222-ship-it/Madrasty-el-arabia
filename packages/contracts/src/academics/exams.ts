import { z } from "zod";
import { pageQuerySchema,revisionSchema,schoolDateSchema } from "../http";

const id=z.uuid();
export const examTime=z.string().regex(/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/);
export const examKind=z.enum(["oral","written"]);
export const examScore=z.number().min(0).max(1000000).multipleOf(.0001);
const clock=examTime.nullable(),score=examScore.nullable(),maximum=examScore.min(.0001);
const feedback=z.string().trim().min(1).max(3000).nullable();
const examDraft=z.object({date:schoolDateSchema,time:clock,kind:examKind,title:z.string().trim().min(1).max(200),maxScore:maximum});
export const examCreate=examDraft.extend({offeringId:id});
export const examChange=examDraft.extend({revision:revisionSchema});
export const examAnnounce=z.object({revision:revisionSchema,date:schoolDateSchema,time:clock.optional()});
export const examAnnouncementReceipt=z.object({
  announcementId:id,revision:revisionSchema,date:schoolDateSchema,time:clock,
  change:z.enum(["initial","reschedule"]),announcedAt:z.iso.datetime(),
});
export const examListQuery=pageQuerySchema.extend({offeringId:id.optional(),classId:id.optional(),childId:id.optional()});
export const examEntry=examDraft.extend({
  id,offeringId:id,classId:id,classCode:z.string(),classNameAr:z.string(),classNameDe:z.string(),
  yearId:id,yearStart:schoolDateSchema,yearEnd:schoolDateSchema,subjectId:id,subjectNameAr:z.string(),subjectNameDe:z.string(),
  revision:revisionSchema,announcementId:id.nullable(),announcementRevision:revisionSchema.nullable(),
  announcedDate:schoolDateSchema.nullable(),announcedTime:clock,announcedAt:z.iso.datetime().nullable(),announcementPending:z.boolean(),
  resultId:id.nullable(),resultRevision:revisionSchema.nullable(),resultDate:schoolDateSchema.nullable(),
  resultScore:score,resultMaxScore:maximum.nullable(),resultFeedback:z.string().nullable(),resultPublishedAt:z.iso.datetime().nullable(),
  canEdit:z.boolean(),canAnnounce:z.boolean(),canReview:z.boolean(),canMark:z.boolean(),canPublish:z.boolean(),
});
export const examRosterQuery=pageQuerySchema.extend({cursor:id.optional()});
export const examRosterRow=z.object({
  studentId:id,studentName:z.string(),studentNumber:z.string(),enrollmentId:id,
  resultId:id.nullable(),revision:revisionSchema,score,feedback:z.string().nullable(),
  publishedId:id.nullable(),publishedRevision:revisionSchema.nullable(),publishedScore:score,publishedMaxScore:maximum.nullable(),
  canMark:z.boolean(),canCorrect:z.boolean(),eligible:z.boolean(),readyToPublish:z.boolean(),
});
export const examMarkInput=z.object({revision:revisionSchema,score,feedback});
export const examMarkReceipt=z.object({resultId:id,revision:revisionSchema});
const reviewed=z.object({studentId:id,revision:revisionSchema});
export const examResultPublish=z.object({revision:revisionSchema,reviewedRows:reviewed.array().min(1).max(1000)})
  .superRefine(({reviewedRows},context)=>{
    const seen=new Set<string>();
    reviewedRows.forEach(({studentId},index)=>{
      if(seen.has(studentId))context.addIssue({code:"custom",path:["reviewedRows",index,"studentId"],message:"error.validation"});
      seen.add(studentId);
    });
  });
export const examResultCorrect=examMarkInput.extend({
  score:examScore,reason:z.string().trim().min(1).max(500),examRevision:revisionSchema.optional(),
});
const publishedRow=reviewed.extend({resultId:id,publicationId:id});
export const examResultBatchReceipt=z.object({batchId:id,rows:publishedRow.array().min(1)});
export const examResultCorrectionReceipt=publishedRow.extend({batchId:id});
export const examResultHistory=z.object({
  publicationId:id,revision:revisionSchema,score:examScore,maxScore:maximum,feedback:z.string().nullable(),date:schoolDateSchema,
  occurredAt:z.iso.datetime(),actorName:z.string().nullable(),reason:z.string().nullable(),
});
export type ExamEntry=z.infer<typeof examEntry>;
export type ExamRosterRow=z.infer<typeof examRosterRow>;
