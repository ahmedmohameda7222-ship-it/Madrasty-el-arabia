import {invoiceConfirm} from "@madrasty/contracts";
import {issueInvoiceBatch} from "@/server/finance/invoices";
import {api,data,readJson} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const POST=api(async(request,context)=>{
  const actor=await requireActor(request,context);
  return data(await issueInvoiceBatch(actor,request.headers.get("idempotency-key"),await readJson(request,invoiceConfirm,2048)),201);
});
