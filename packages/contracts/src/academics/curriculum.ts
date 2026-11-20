import { z } from "zod";
import { localeSchema, pageQuerySchema, revisionSchema, schoolDateSchema } from "../http";

const subjectFields=z.object({
  nameAr:z.string().trim().min(1).max(160),nameDe:z.string().trim().min(1).max(160),
  descriptionAr:z.string().trim().max(3000),descriptionDe:z.string().trim().max(3000),
});
const subjectCode=z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,23}$/);
export const curriculumSubjectCreate=subjectFields.extend({code:subjectCode});
export const curriculumSubjectChange=subjectFields.extend({archived:z.boolean(),revision:revisionSchema});
export const curriculumSubject=subjectFields.extend({id:z.uuid(),code:subjectCode,archived:z.boolean(),revision:revisionSchema});
export const academicChildQuery=z.object({childId:z.uuid().optional()});
export const curriculumSubjectsQuery=pageQuerySchema.extend({childId:z.uuid().optional(),cursor:z.uuid().optional()});

export const curriculumOffering=z.object({
  id:z.uuid(),subjectId:z.uuid(),classId:z.uuid(),classCode:z.string(),classNameAr:z.string(),classNameDe:z.string(),
  yearId:z.uuid(),yearStart:schoolDateSchema,yearEnd:schoolDateSchema,canPlan:z.boolean(),canPublish:z.boolean(),
});
export const lessonListQuery=pageQuerySchema.extend({childId:z.uuid().optional(),offeringId:z.uuid().optional()});
const content=z.object({
  sourceLanguage:localeSchema,titleAr:z.string().trim().max(200),bodyAr:z.string().trim().max(12000),
  titleDe:z.string().trim().max(200),bodyDe:z.string().trim().max(12000),
});
function requireContent(value:z.infer<typeof content>,context:z.RefinementCtx){
  const source=value.sourceLanguage==="ar"?["titleAr","bodyAr"] as const:["titleDe","bodyDe"] as const;
  const translation=value.sourceLanguage==="ar"?["titleDe","bodyDe"] as const:["titleAr","bodyAr"] as const;
  for(const field of source)if(!value[field])context.addIssue({code:"custom",path:[field],message:"error.validation"});
  if(Boolean(value[translation[0]])!==Boolean(value[translation[1]])){
    context.addIssue({code:"custom",path:[value[translation[0]]?translation[1]:translation[0]],message:"error.validation"});
  }
}
const draft=content.extend({unitId:z.uuid().nullable(),sortOrder:z.int().min(0).max(10000),plannedDate:schoolDateSchema.nullable()});
export const lessonCreate=draft.extend({offeringId:z.uuid()}).superRefine(requireContent);
export const lessonChange=draft.extend({revision:revisionSchema}).superRefine(requireContent);
export const lessonPublish=z.object({revision:revisionSchema});
export const lessonReceipt=z.object({id:z.uuid(),revision:revisionSchema});
export const lessonPublished=z.object({publicationId:z.uuid(),publishedAt:z.iso.datetime(),revision:revisionSchema});
export const curriculumLesson=draft.extend({
  id:z.uuid(),offeringId:z.uuid(),unitId:z.uuid(),revision:revisionSchema,publishedRevision:revisionSchema.nullable(),
  publicationId:z.uuid().nullable(),publishedAt:z.iso.datetime().nullable(),canEdit:z.boolean(),canPublish:z.boolean(),
  latestDeliveryDate:schoolDateSchema.nullable(),
});
export type CurriculumSubject=z.infer<typeof curriculumSubject>;
export type CurriculumOffering=z.infer<typeof curriculumOffering>;
export type CurriculumLesson=z.infer<typeof curriculumLesson>;
