import { threadReaderInput } from "@madrasty/contracts";
import { academicId,type AcademicIdRoute } from "@/server/academics/route-params";
import { updateThreadState } from "@/server/comms/messages";
import { api,data,readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";

export const PATCH=api(async(request,context,route:AcademicIdRoute)=>{
  const actor=await requireActor(request,context),id=await academicId(route),input=await readJson(request,threadReaderInput);
  return data(await updateThreadState(actor,id,input));
});
