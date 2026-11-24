import {cashbookQuery} from "@madrasty/contracts";
import {readCashbook} from "@/server/finance/cashbook";
import {cashbookPdf,pdfResponse} from "@/server/finance/documents";
import {api,ApiError} from "@/server/http";
import {requireActor} from "@/server/identity/actor";
export const GET=api(async(request,context)=>{
  const url=new URL(request.url),query=cashbookQuery.safeParse({month:url.searchParams.get("month")??undefined});
  if(!query.success)throw new ApiError("validation");
  const item=await readCashbook(await requireActor(request,context),query.data.month);
  if(item.entryCount>item.entries.length||item.entries.length>100)throw new ApiError("validation");
  const locale=url.searchParams.get("locale")==="ar"?"ar":"de";
  return pdfResponse(await cashbookPdf(item,locale),"Kassenbuch-"+item.month);
});
