import { academicChildQuery,evaluationChange } from "@madrasty/contracts";
import { readEvaluation,writeEvaluation } from "@/server/academics/evaluations";
import { academicId,academicQuery,type AcademicIdRoute } from "@/server/academics/route-params";
import { api,data,readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";

export const GET=api(async(request,context,route:AcademicIdRoute)=>{
  const actor=await requireActor(request,context);
  return data(await readEvaluation(actor,await academicId(route),academicQuery(request,academicChildQuery).childId));
});
export const PATCH=api(async(request,context,route:AcademicIdRoute)=>{
  const actor=await requireActor(request,context),id=await academicId(route),input=await readJson(request,evaluationChange,80*1024);
  return data((await writeEvaluation(actor,request.headers.get("idempotency-key"),input,id)).data);
});
