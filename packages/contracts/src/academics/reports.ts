import { z } from "zod";
import { pageQuerySchema,revisionSchema,schoolDateSchema } from "../http";

const id=z.uuid(),date=schoolDateSchema;
const dates=z.object({from:date,to:date});
function validRange(value:z.infer<typeof dates>,context:z.RefinementCtx){
  if(value.from>value.to)context.addIssue({code:"custom",path:["to"],message:"error.validation"});
}
export const academicReportQuery=dates.extend({subjectId:id.optional()}).superRefine(validRange);
export const reportStudentSearch=pageQuerySchema.extend(dates.shape).extend({
  query:z.string().trim().max(120).optional(),classId:id.optional(),cursor:id.optional(),
}).superRefine(validRange);
export const reportPupil=z.object({id,displayName:z.string(),studentNumber:z.string()});
export const reportEnrollment=z.object({
  enrollmentId:id,classId:id,classCode:z.string(),classNameAr:z.string(),classNameDe:z.string(),
  yearId:id,yearStart:date,yearEnd:date,enrolledFrom:date,enrolledUntil:date,
});
export const reportSubject=z.object({id,nameAr:z.string(),nameDe:z.string()});
const count=z.int().nonnegative(),points=z.number().nonnegative(),scale=z.int().min(1).max(5);
export const reportSource=z.object({
  kind:z.enum(["attendance","teaching","activity","homework","evaluation","exam"]),
  sourceId:id,resourceId:id.nullable(),offeringId:id.nullable(),subjectId:id.nullable(),classId:id,yearId:id,enrollmentId:id,
  date,periodFrom:date.nullable(),titleAr:z.string().nullable(),titleDe:z.string().nullable(),
  status:z.enum(["present","late","absent_unexcused","absent_excused","cancelled","oral","written"]).nullable(),
  numerator:points.nullable(),maximum:points.nullable(),participation:scale.nullable(),
  understanding:scale.nullable(),preparation:scale.nullable(),revision:revisionSchema,included:z.boolean(),
  visibility:z.enum(["approved","recorded","assigned","published"]),
  inclusionReason:z.enum(["approved_day","cancelled_day","unmarked_day","delivered_lesson","missing_score","recorded_score",
    "published_evaluation","published_result"]),
});
const pointsTotal=z.object({count,earned:points,possible:points});
const scaleTotal=z.object({count,average:points.nullable()});
export const reportGroup=z.object({
  subjectId:id,teachingCount:count,homework:z.object({assigned:count,scored:count,mean:points.nullable()}),
  activities:pointsTotal,exams:pointsTotal,
  evaluations:z.object({participation:scaleTotal,understanding:scaleTotal,preparation:scaleTotal}),
});
export const academicReport=z.object({
  from:date,to:date,subjectId:id.nullable(),student:reportPupil,enrollments:reportEnrollment.array(),
  subjects:reportSubject.array(),sources:reportSource.array(),groups:reportGroup.array(),
  attendance:z.object({days:count,present:count,late:count,absent_unexcused:count,absent_excused:count,cancelled:count}),
});
export type AcademicReport=z.infer<typeof academicReport>;
export type ReportSource=z.infer<typeof reportSource>;
