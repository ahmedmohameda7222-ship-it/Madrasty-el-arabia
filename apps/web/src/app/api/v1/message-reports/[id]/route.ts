import {messageReportUpdate} from "@madrasty/contracts";
import {academicId,type AcademicIdRoute} from "@/server/academics/route-params";
import {readMessageReport,reviewMessageReport} from "@/server/comms/moderation";
import {api,data,readJson} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const GET=api(async(request,context,route:AcademicIdRoute)=>
  data(await readMessageReport(await requireActor(request,context),await academicId(route))));
export const PATCH=api(async(request,context,route:AcademicIdRoute)=>{
  const actor=await requireActor(request,context),id=await academicId(route);
  return data(await reviewMessageReport(actor,id,request.headers.get("idempotency-key"),await readJson(request,messageReportUpdate,2048)));
});
