import {receiptQuery,recordReceiptInput} from "@madrasty/contracts";
import {academicQuery} from "@/server/academics/route-params";
import {listReceipts,recordReceipt} from "@/server/finance/receipts";
import {api,data,readJson} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const GET=api(async(request,context)=>{
  const page=await listReceipts(await requireActor(request,context),academicQuery(request,receiptQuery));
  return data(page.items,200,{nextCursor:page.nextCursor});
});

export const POST=api(async(request,context)=>{
  const actor=await requireActor(request,context);
  return data(await recordReceipt(actor,request.headers.get("idempotency-key"),await readJson(request,recordReceiptInput)),201);
});
