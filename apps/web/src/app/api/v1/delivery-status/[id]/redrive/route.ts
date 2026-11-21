import {deliveryRedrive} from "@madrasty/contracts";
import {academicId,type AcademicIdRoute} from "@/server/academics/route-params";
import {redriveDeliveryStatus} from "@/server/comms/delivery-status";
import {api,data,readJson} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const POST=api(async(request,context,route:AcademicIdRoute)=>{
  const actor=await requireActor(request,context),id=await academicId(route),input=await readJson(request,deliveryRedrive,1024);
  return data(await redriveDeliveryStatus(actor,id,input.revision,request.headers.get("idempotency-key")));
});
