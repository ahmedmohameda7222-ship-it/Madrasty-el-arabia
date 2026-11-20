import { homeworkGradeInput } from "@madrasty/contracts";
import { gradeHistory,readHomeworkGrades,saveOneHomeworkGrade } from "@/server/academics/gradebook";
import { academicPupil,type AcademicPupilRoute } from "@/server/academics/route-params";
import { api,data } from "@/server/http";
import { requireActor } from "@/server/identity/actor";

export const GET=api(async(request,context,route:AcademicPupilRoute)=>{
  const actor=await requireActor(request,context),{id,studentId}=await academicPupil(route);
  return data(await gradeHistory(actor,id,studentId));
});
export const PATCH=api(async(request,context,route:AcademicPupilRoute)=>{
  const actor=await requireActor(request,context),{id,studentId}=await academicPupil(route);
  const input=await readHomeworkGrades(request,homeworkGradeInput);
  return data(await saveOneHomeworkGrade(actor,id,studentId,request.headers.get("idempotency-key"),input));
});
