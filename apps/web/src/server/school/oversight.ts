import "server-only";
import { adminClassOversight, type AdminClassOversight } from "@madrasty/contracts";
import { type ActorContext, withActor } from "@/server/db/scoped";
import { ApiError } from "@/server/http";

export function schoolOversight(actor:ActorContext, requested?:string):Promise<AdminClassOversight> {
  if(actor.persona!=="admin")throw new ApiError("forbidden");
  return withActor(actor,async tx=>{
    const [permissions]=await tx<{academics:boolean;attendance:boolean}[]>`
      select app.has_capability('academics.supervise') as academics,
             app.has_capability('attendance.supervise') as attendance
    `;
    if(!permissions?.academics&&!permissions?.attendance)throw new ApiError("forbidden");
    const [clock]=await tx<{today:string}[]>`select app.school_today()::text as today`;
    const date=requested??clock.today;
    const rows=await tx`
      select class_id as "classId",year_id as "yearId",class_code as "classCode",
        class_name_ar as "classNameAr",class_name_de as "classNameDe",
        teacher_name as "teacherName",attendance_state as "attendanceState",
        unmarked_count as "unmarkedCount",teaching_entries as "teachingEntries",
        active_homework as "activeHomework",upcoming_exams as "upcomingExams",
        marked_exam_results as "markedExamResults"
      from app.admin_class_oversight(${date}::date)
    `;
    return adminClassOversight.parse({date,classes:rows});
  });
}
