import {eventChange} from "@madrasty/contracts";
import {academicId,type AcademicIdRoute} from "@/server/academics/route-params";
import {readSchoolPublishing,writeSchoolPublishing} from "@/server/comms/schoolPublishing";
import {api,data,readJson} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const GET=api(async(request,context,route:AcademicIdRoute)=>
  data(await readSchoolPublishing(await requireActor(request,context),"event",await academicId(route))));
export const PATCH=api(async(request,context,route:AcademicIdRoute)=>{
  const actor=await requireActor(request,context),id=await academicId(route),input=await readJson(request,eventChange);
  return data(await writeSchoolPublishing(actor,"event",request.headers.get("idempotency-key"),input,id));
});
