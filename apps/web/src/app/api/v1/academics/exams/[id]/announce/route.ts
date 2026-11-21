import { examAnnounce } from "@madrasty/contracts";
import { announceExam } from "@/server/academics/exams";
import { academicId,type AcademicIdRoute } from "@/server/academics/route-params";
import { api,data,readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";

export const POST=api(async(request,context,route:AcademicIdRoute)=>{
  const actor=await requireActor(request,context),id=await academicId(route),input=await readJson(request,examAnnounce);
  return data((await announceExam(actor,id,request.headers.get("idempotency-key"),input)).data);
});
