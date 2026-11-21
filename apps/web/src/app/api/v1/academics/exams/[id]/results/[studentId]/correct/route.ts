import { examResultCorrect } from "@madrasty/contracts";
import { correctExamResult } from "@/server/academics/exams";
import { academicPupil,type AcademicPupilRoute } from "@/server/academics/route-params";
import { readDecimalJson } from "@/server/academics/decimal-json";
import { api,data } from "@/server/http";
import { requireActor } from "@/server/identity/actor";

export const POST=api(async(request,context,route:AcademicPupilRoute)=>{
  const actor=await requireActor(request,context),{id,studentId}=await academicPupil(route),input=await readDecimalJson(request,examResultCorrect,["score"]);
  return data((await correctExamResult(actor,id,studentId,request.headers.get("idempotency-key"),input)).data);
});
