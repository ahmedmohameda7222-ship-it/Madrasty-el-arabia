import { z } from "zod";
import { pageQuerySchema,revisionSchema,schoolDateSchema } from "../http";

export const homeworkScore=z.number().min(0).max(20).multipleOf(.5);
const id=z.uuid();
export const homeworkListQuery=pageQuerySchema.extend({childId:id.optional(),classId:id.optional(),offeringId:id.optional()});
const draft=z.object({
  title:z.string().trim().min(1).max(200),instructions:z.string().trim().min(1).max(12000),
  lessonId:id.nullable(),issuedOn:schoolDateSchema,dueOn:schoolDateSchema,
});
function orderedDates(value:z.infer<typeof draft>,context:z.RefinementCtx){
  if(value.issuedOn>value.dueOn)context.addIssue({code:"custom",path:["dueOn"],message:"error.validation"});
}
export const homeworkCreate=draft.extend({offeringId:id}).superRefine(orderedDates);
export const homeworkChange=draft.extend({revision:revisionSchema}).superRefine(orderedDates);
export const homeworkEntry=draft.extend({
  id,offeringId:id,classId:id,classCode:z.string(),classNameAr:z.string(),classNameDe:z.string(),yearId:id,
  yearStart:schoolDateSchema,yearEnd:schoolDateSchema,subjectId:id,subjectNameAr:z.string(),subjectNameDe:z.string(),
  revision:revisionSchema,rosterCount:z.int().nonnegative().nullable(),canEdit:z.boolean(),canGrade:z.boolean(),
  joinedOn:schoolDateSchema.nullable(),addedLater:z.boolean().nullable(),score:homeworkScore.nullable(),feedback:z.string().nullable(),
});
export type HomeworkEntry=z.infer<typeof homeworkEntry>;
