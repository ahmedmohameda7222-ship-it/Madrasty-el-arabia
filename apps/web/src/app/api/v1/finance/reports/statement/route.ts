import {financeStatementQuery} from "@madrasty/contracts";
import {academicQuery} from "@/server/academics/route-params";
import {listFinanceStatement} from "@/server/finance/reports";
import {api,data} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const GET=api(async(request,context)=>{
  const page=await listFinanceStatement(await requireActor(request,context),academicQuery(request,financeStatementQuery));
  return data(page.items,200,{nextCursor:page.nextCursor});
});
