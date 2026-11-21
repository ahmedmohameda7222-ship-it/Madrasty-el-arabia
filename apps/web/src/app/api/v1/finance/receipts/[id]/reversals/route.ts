import {receiptReversalInput} from "@madrasty/contracts";
import {academicId,type AcademicIdRoute} from "@/server/academics/route-params";
import {reverseReceipt} from "@/server/finance/allocations";
import {api,data,readJson} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const POST=api(async(request,context,route:AcademicIdRoute)=>{
  const actor=await requireActor(request,context);
  const result=await reverseReceipt(actor,await academicId(route),request.headers.get("idempotency-key"),
    await readJson(request,receiptReversalInput));
  return data(result,201);
});
