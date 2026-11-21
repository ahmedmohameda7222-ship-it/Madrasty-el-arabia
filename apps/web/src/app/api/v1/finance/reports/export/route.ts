import {financeReportQuery} from "@madrasty/contracts";
import {academicQuery} from "@/server/academics/route-params";
import {exportFinanceStatement} from "@/server/finance/reports";
import {api} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const GET=api(async(request,context)=>{
  const file=await exportFinanceStatement(await requireActor(request,context),academicQuery(request,financeReportQuery));
  return new Response(file.body,{headers:{
    "Content-Type":"text/csv; charset=utf-8","Content-Disposition":'attachment; filename="'+file.name+'"',
    "X-Content-Type-Options":"nosniff",
  }});
});
