import { examResultPublish } from "@madrasty/contracts";
import { publishExamResults } from "@/server/academics/exams";
import { academicId,type AcademicIdRoute } from "@/server/academics/route-params";
import { api,data,readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";

export const POST=api(async(request,context,route:AcademicIdRoute)=>{
  const actor=await requireActor(request,context),id=await academicId(route),input=await readJson(request,examResultPublish,128*1024);
  return data((await publishExamResults(actor,id,request.headers.get("idempotency-key"),input)).data);
});
