import {z} from "zod";
import {schoolDateSchema} from "../http";

const id=z.uuid(),day=schoolDateSchema;
const subject=z.object({subjectAr:z.string(),subjectDe:z.string()});
const pupil=z.object({studentId:id,name:z.string(),number:z.string()});
const publishedMark=z.object({studentId:id,studentName:z.string(),score:z.number().nullable(),
  maxScore:z.number(),feedback:z.string().nullable()});
const attendanceStatus=z.enum(["present","late","absent_unexcused","absent_excused"]).nullable();
const officialEvaluation=subject.extend({
  id,title:z.string(),periodStart:day,periodEnd:day,publishedAt:z.string(),
  participation:z.int().min(1).max(5),understanding:z.int().min(1).max(5),
  preparation:z.int().min(1).max(5),strengths:z.string(),improvements:z.string(),
});
export const adminMonitorClass=z.object({
  classId:id,yearId:id,code:z.string(),nameAr:z.string(),nameDe:z.string(),
  teacherName:z.string().nullable(),studentCount:z.int().nonnegative(),
  lastAttendanceDate:day.nullable(),
});
export const adminMonitorDashboard=z.object({
  classroom:z.object({classId:id,yearId:id,code:z.string(),nameAr:z.string(),
    nameDe:z.string(),teacherName:z.string().nullable()}),
  students:pupil.array(),
  lastAttendance:z.object({date:day,present:z.int().nonnegative(),late:z.int().nonnegative(),
    absentUnexcused:z.int().nonnegative(),absentExcused:z.int().nonnegative()}).nullable(),
  attendance:z.object({studentId:id,date:day,status:attendanceStatus}).array(),
  exams:subject.extend({id,title:z.string(),date:day,time:z.string().nullable(),
    kind:z.enum(["oral","written"]),maxScore:z.number(),publishedCount:z.int().nonnegative(),
    publishedResults:publishedMark.array()}).array(),
  homework:subject.extend({id,title:z.string(),instructions:z.string(),
    issuedOn:day,dueOn:day,publishedCount:z.int().nonnegative(),
    publishedResults:publishedMark.array()}).array(),
  activities:subject.extend({id,title:z.string(),date:day,maxScore:z.number(),
    publishedCount:z.int().nonnegative(),
    publishedResults:publishedMark.array()}).array(),
  evaluations:officialEvaluation.extend({studentId:id,studentName:z.string()}).array(),
  teaching:subject.extend({id,date:day,notes:z.string(),recordedAt:z.string(),
    teacher:z.string().nullable()}).array(),
});
export const adminMonitorStudent=z.object({
  student:pupil.extend({classId:id,classCode:z.string(),classNameAr:z.string(),
    classNameDe:z.string(),yearId:id}),
  attendance:z.object({date:day,status:attendanceStatus}).array(),
  exams:subject.extend({id,title:z.string(),date:day,score:z.number(),maxScore:z.number(),
    feedback:z.string().nullable(),publishedAt:z.string()}).array(),
  homework:subject.extend({id,title:z.string(),issuedOn:day,dueOn:day,
    score:z.number().nullable(),feedback:z.string().nullable()}).array(),
  activities:subject.extend({id,title:z.string(),date:day,maxScore:z.number(),
    score:z.number().nullable()}).array(),
  evaluations:officialEvaluation.array(),
});
export type AdminMonitorClass=z.infer<typeof adminMonitorClass>;
export type AdminMonitorDashboard=z.infer<typeof adminMonitorDashboard>;
export type AdminMonitorStudent=z.infer<typeof adminMonitorStudent>;
