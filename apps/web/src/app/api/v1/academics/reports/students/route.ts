import { reportStudentSearch } from "@madrasty/contracts";
import { searchReportStudents } from "@/server/academics/reports";
import { academicQuery } from "@/server/academics/route-params";
import { api,data } from "@/server/http";
import { requireActor } from "@/server/identity/actor";

export const GET=api(async(request,context)=>{
  const page=await searchReportStudents(await requireActor(request,context),academicQuery(request,reportStudentSearch));
  return data(page.items,200,{nextCursor:page.nextCursor});
});
