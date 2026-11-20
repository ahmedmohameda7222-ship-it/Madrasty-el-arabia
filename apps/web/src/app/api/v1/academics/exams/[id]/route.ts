import { academicChildQuery,examChange } from "@madrasty/contracts";
import { loadExam,saveExam } from "@/server/academics/exams";
import { academicId,academicQuery,type AcademicIdRoute } from "@/server/academics/route-params";
import { readDecimalJson } from "@/server/academics/decimal-json";
import { api,data } from "@/server/http";
import { requireActor } from "@/server/identity/actor";

export const GET=api(async(request,context,route:AcademicIdRoute)=>{
  const actor=await requireActor(request,context);
  return data(await loadExam(actor,await academicId(route),academicQuery(request,academicChildQuery).childId));
});
export const PATCH=api(async(request,context,route:AcademicIdRoute)=>{
  const actor=await requireActor(request,context),id=await academicId(route),input=await readDecimalJson(request,examChange,["maxScore"]);
  return data((await saveExam(actor,request.headers.get("idempotency-key"),input,id)).data);
});
