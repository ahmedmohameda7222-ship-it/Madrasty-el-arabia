import { z } from "zod";
import { pageQuerySchema,revisionSchema,schoolDateSchema } from "../http";
import { homeworkScore } from "./homework";

const id=z.uuid(),reason=z.string().trim().min(1).max(500),feedback=z.string().trim().min(1).max(3000);
export const gradingInboxQuery=pageQuerySchema.extend({classId:id.optional()});
export const homeworkGradeRosterQuery=pageQuerySchema.extend({cursor:id.optional()});
export const homeworkGradeRow=z.object({
  rosterId:id,studentId:id,studentName:z.string(),studentNumber:z.string(),joinedOn:schoolDateSchema,
  addedLater:z.boolean(),score:homeworkScore.nullable(),feedback:z.string().nullable(),revision:revisionSchema,
  visible:z.boolean(),canEdit:z.boolean(),corrected:z.boolean(),
});
export const homeworkGradingItem=z.object({
  homeworkId:id,offeringId:id,classId:id,classCode:z.string(),subjectNameAr:z.string(),subjectNameDe:z.string(),title:z.string(),
  issuedOn:schoolDateSchema,dueOn:schoolDateSchema,graded:z.int().nonnegative(),total:z.int().nonnegative(),canEdit:z.boolean(),
});
export const homeworkGradeInput=z.object({
  revision:revisionSchema,score:homeworkScore.nullable().optional(),feedback:feedback.nullable().optional(),reasonIfCorrection:reason.optional(),
}).refine((value)=>value.score!==undefined||value.feedback!==undefined,{path:["score"],message:"error.validation"});
export const homeworkGradeBulkInput=z.object({
  rows:z.object({studentId:id,revision:revisionSchema,score:homeworkScore.nullable(),reasonIfCorrection:reason.optional()})
    .strict().array().min(1).max(1000),
}).superRefine(({rows},context)=>{
  const seen=new Set<string>();
  rows.forEach(({studentId},index)=>{
    if(seen.has(studentId))context.addIssue({code:"custom",path:["rows",index,"studentId"],message:"error.validation"});
    seen.add(studentId);
  });
});
const savedRow=z.object({studentId:id,rosterId:id,revision:revisionSchema,changed:z.boolean(),correction:z.boolean()});
export const homeworkGradeReceipt=savedRow;
export const homeworkGradeBulkReceipt=z.object({
  rows:savedRow.array(),changedCount:z.int().nonnegative(),graded:z.int().nonnegative(),total:z.int().nonnegative(),
});
export const homeworkGradeCorrection=z.object({
  revision:revisionSchema,previousScore:homeworkScore.nullable(),score:homeworkScore.nullable(),
  previousFeedback:z.string().nullable(),feedback:z.string().nullable(),actorName:z.string().nullable(),occurredAt:z.iso.datetime(),reason:z.string(),
});
export type HomeworkGradeRow=z.infer<typeof homeworkGradeRow>;
export type HomeworkGradingItem=z.infer<typeof homeworkGradingItem>;
