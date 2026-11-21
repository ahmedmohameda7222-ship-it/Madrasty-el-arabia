import { loadExamMarkHistory } from "@/server/academics/exams";
import { academicPupil,type AcademicPupilRoute } from "@/server/academics/route-params";
import { api,data } from "@/server/http";
import { requireActor } from "@/server/identity/actor";

export const GET=api(async(request,context,route:AcademicPupilRoute)=>{
  const actor=await requireActor(request,context),{id,studentId}=await academicPupil(route);
  return data(await loadExamMarkHistory(actor,id,studentId));
});
