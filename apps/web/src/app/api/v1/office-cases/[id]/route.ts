import { officeCaseInput } from "@madrasty/contracts";
import { academicId,type AcademicIdRoute } from "@/server/academics/route-params";
import { readOfficeCase,updateOfficeCase } from "@/server/comms/threads";
import { api,data,readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";

export const GET=api(async(request,context,route:AcademicIdRoute)=>
  data(await readOfficeCase(await requireActor(request,context),await academicId(route))));
export const PATCH=api(async(request,context,route:AcademicIdRoute)=>{
  const actor=await requireActor(request,context),id=await academicId(route),input=await readJson(request,officeCaseInput);
  return data(await updateOfficeCase(actor,id,request.headers.get("idempotency-key"),input));
});
