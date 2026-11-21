import { evaluationPublish } from "@madrasty/contracts";
import { publishEvaluation } from "@/server/academics/evaluations";
import { academicId,type AcademicIdRoute } from "@/server/academics/route-params";
import { api,data,readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";

export const POST=api(async(request,context,route:AcademicIdRoute)=>{
  const actor=await requireActor(request,context),id=await academicId(route);
  const input=await readJson(request,evaluationPublish);
  return data((await publishEvaluation(actor,id,request.headers.get("idempotency-key"),input.revision)).data);
});
