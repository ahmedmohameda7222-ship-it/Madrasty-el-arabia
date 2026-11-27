import {financeLedgerQuery} from "@madrasty/contracts";
import {academicQuery} from "@/server/academics/route-params";
import {listFinanceLedger} from "@/server/finance/cashbook";
import {api,data} from "@/server/http";
import {requireActor} from "@/server/identity/actor";
export const GET=api(async(request,context)=>{
  const page=await listFinanceLedger(await requireActor(request,context),academicQuery(request,financeLedgerQuery));
  return data(page.items,200,{nextCursor:page.nextCursor});
});
