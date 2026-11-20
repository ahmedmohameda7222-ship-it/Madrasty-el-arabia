import { academicReportQuery } from "@madrasty/contracts";
import { readAcademicReport } from "@/server/academics/reports";
import { academicId,academicQuery,type AcademicIdRoute } from "@/server/academics/route-params";
import { api,data } from "@/server/http";
import { requireActor } from "@/server/identity/actor";

export const GET=api(async(request,context,route:AcademicIdRoute)=>{
  const actor=await requireActor(request,context),id=await academicId(route);
  return data(await readAcademicReport(actor,id,academicQuery(request,academicReportQuery)));
});
