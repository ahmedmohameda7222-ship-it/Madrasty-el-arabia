import { z } from "zod";
import { schoolDateSchema } from "../http";

export const adminClassOversightRow = z.object({
  classId: z.uuid(),
  yearId: z.uuid(),
  classCode: z.string(),
  classNameAr: z.string(),
  classNameDe: z.string(),
  teacherName: z.string().nullable(),
  attendanceState: z.enum(["not_started","open","approved"]).nullable(),
  unmarkedCount: z.number().int().min(0).nullable(),
  teachingEntries: z.number().int().min(0).nullable(),
  activeHomework: z.number().int().min(0).nullable(),
  upcomingExams: z.number().int().min(0).nullable(),
  markedExamResults: z.number().int().min(0).nullable(),
});
export const adminClassOversight = z.object({
  date: schoolDateSchema,
  classes: z.array(adminClassOversightRow).max(500),
});
export type AdminClassOversight = z.infer<typeof adminClassOversight>;
