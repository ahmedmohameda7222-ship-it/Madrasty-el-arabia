import {invoicePreviewInput} from "@madrasty/contracts";
import {prepareInvoicePreview} from "@/server/finance/invoices";
import {api,data,readJson} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const POST=api(async(request,context)=>{
  const actor=await requireActor(request,context);
  return data(await prepareInvoicePreview(actor,await readJson(request,invoicePreviewInput)),201);
});
