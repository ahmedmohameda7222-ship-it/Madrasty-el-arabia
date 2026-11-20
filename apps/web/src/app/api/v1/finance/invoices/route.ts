import {invoiceQuery} from "@madrasty/contracts";
import {academicQuery} from "@/server/academics/route-params";
import {listInvoices} from "@/server/finance/invoices";
import {api,data} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const GET=api(async(request,context)=>{
  const page=await listInvoices(await requireActor(request,context),academicQuery(request,invoiceQuery));
  return data(page.items,200,{nextCursor:page.nextCursor});
});
