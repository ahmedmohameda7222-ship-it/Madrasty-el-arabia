import {payerEdit} from "@madrasty/contracts";
import {academicId,type AcademicIdRoute} from "@/server/academics/route-params";
import {readPayer,setPayer} from "@/server/finance/feeSettings";
import {api,data,readJson} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const GET=api(async(request,context,route:AcademicIdRoute)=>
  data(await readPayer(await requireActor(request,context),await academicId(route))));
export const PUT=api(async(request,context,route:AcademicIdRoute)=>{
  const actor=await requireActor(request,context),studentId=await academicId(route);
  return data(await setPayer(actor,studentId,request.headers.get("idempotency-key"),await readJson(request,payerEdit,2048)));
});
