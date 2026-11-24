import {academicId,type AcademicIdRoute} from "@/server/academics/route-params";
import {loadInvoice} from "@/server/finance/invoices";
import {invoicePdf,pdfResponse} from "@/server/finance/documents";
import {api} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const GET=api(async(request,context,route:AcademicIdRoute)=>{
  const actor=await requireActor(request,context);
  const item=await loadInvoice(actor,await academicId(route));
  const locale=new URL(request.url).searchParams.get("locale")==="ar"?"ar":"de";
  return pdfResponse(await invoicePdf(item,locale),item.invoiceNumber);
});
