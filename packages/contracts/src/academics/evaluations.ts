import { z } from "zod";
import { pageQuerySchema,revisionSchema,schoolDateSchema } from "../http";

const id=z.uuid(),dimension=z.int().min(1).max(5);
export const evaluationScales={participation:dimension,understanding:dimension,preparation:dimension};
const notes=z.string().trim().max(6000);
const content=z.object({title:z.string().trim().min(1).max(200),strengths:notes,improvements:notes});
const publishedContent=content.extend(evaluationScales);
const draft=content.extend({
  participation:dimension.nullable(),understanding:dimension.nullable(),preparation:dimension.nullable(),
  periodStart:schoolDateSchema,periodEnd:schoolDateSchema,
});
function period(value:z.infer<typeof draft>,context:z.RefinementCtx){
  if(value.periodStart>value.periodEnd)context.addIssue({code:"custom",path:["periodEnd"],message:"error.validation"});
}
export const evaluationCreate=draft.extend({offeringId:id,studentId:id}).superRefine(period);
export const evaluationChange=draft.extend({revision:revisionSchema}).superRefine(period);
export const evaluationPublish=z.object({revision:revisionSchema});
export const evaluationCorrect=evaluationPublish.extend({changes:publishedContent,reason:z.string().trim().min(1).max(500)});
export const evaluationEntry=draft.extend({
  id,studentId:id,studentName:z.string(),studentNumber:z.string(),offeringId:id,classId:id,classCode:z.string(),
  classNameAr:z.string(),classNameDe:z.string(),yearId:id,yearStart:schoolDateSchema,yearEnd:schoolDateSchema,
  subjectId:id,subjectNameAr:z.string(),subjectNameDe:z.string(),revision:revisionSchema,publishedId:id.nullable(),
  publishedRevision:revisionSchema.nullable(),publishedAt:z.iso.datetime().nullable(),canEdit:z.boolean(),canPublish:z.boolean(),hasCorrections:z.boolean(),
});
export const evaluationListQuery=pageQuerySchema.extend({offeringId:id.optional(),classId:id.optional(),childId:id.optional()});
export const assessmentRosterQuery=pageQuerySchema.extend({offeringId:id,date:schoolDateSchema,cursor:id.optional()});
export const assessmentPupil=z.object({studentId:id,enrollmentId:id,studentName:z.string(),studentNumber:z.string()});
export const evaluationPublication=publishedContent.extend({id,revision:revisionSchema,publishedAt:z.iso.datetime(),actorName:z.string().nullable(),reason:z.string().nullable()});
export const evaluationPublicationReceipt=z.object({publicationId:id,revision:revisionSchema,publishedAt:z.iso.datetime()});
export type EvaluationEntry=z.infer<typeof evaluationEntry>;
