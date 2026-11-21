import {financeReportQuery} from "@madrasty/contracts";
import {academicQuery} from "@/server/academics/route-params";
import {readFinanceSummary} from "@/server/finance/reports";
import {api,data} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const GET=api(async(request,context)=>
  data(await readFinanceSummary(await requireActor(request,context),academicQuery(request,financeReportQuery))));
