import {academicId,type AcademicIdRoute} from "@/server/academics/route-params";
import {loadReceipt} from "@/server/finance/receipts";
import {receiptPdf,pdfResponse} from "@/server/finance/documents";
import {api} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const GET=api(async(request,context,route:AcademicIdRoute)=>{
  const actor=await requireActor(request,context);
  const item=await loadReceipt(actor,await academicId(route));
  const locale=new URL(request.url).searchParams.get("locale")==="ar"?"ar":"de";
  return pdfResponse(await receiptPdf(item,locale),item.receiptNumber);
});
