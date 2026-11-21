import { teachingLogChange } from "@madrasty/contracts";
import { teachingById,updateTeachingLog } from "@/server/academics/teaching-activity";
import { academicId,type AcademicIdRoute } from "@/server/academics/route-params";
import { api,data,readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";

export const GET=api(async(request,context,route:AcademicIdRoute)=>
  data(await teachingById(await requireActor(request,context),await academicId(route))));
export const PATCH=api(async(request,context,route:AcademicIdRoute)=>{
  const actor=await requireActor(request,context);
  const id=await academicId(route),input=await readJson(request,teachingLogChange,80*1024);
  return data((await updateTeachingLog(actor,request.headers.get("idempotency-key"),input,id)).data);
});
