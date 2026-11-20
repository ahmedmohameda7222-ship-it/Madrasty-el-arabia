import {uploadMediaInput} from "@madrasty/contracts";
import {academicId,type AcademicIdRoute} from "@/server/academics/route-params";
import {issueMediaUpload} from "@/server/comms/media";
import {api,data,readJson} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const POST=api(async(request,context,route:AcademicIdRoute)=>{
  const actor=await requireActor(request,context),thread=await academicId(route);
  return data(await issueMediaUpload(actor,thread,request.headers.get("idempotency-key"),
    await readJson(request,uploadMediaInput,2048)),201);
});
