import {receiptRefundInput} from "@madrasty/contracts";
import {academicId,type AcademicIdRoute} from "@/server/academics/route-params";
import {refundReceipt} from "@/server/finance/receipts";
import {api,data,readJson} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const POST=api(async(request,context,route:AcademicIdRoute)=>{
  const actor=await requireActor(request,context);
  return data(await refundReceipt(actor,await academicId(route),request.headers.get("idempotency-key"),await readJson(request,receiptRefundInput)),201);
});
