import { examRosterQuery } from "@madrasty/contracts";
import { listExamMarks } from "@/server/academics/exams";
import { academicId,academicQuery,type AcademicIdRoute } from "@/server/academics/route-params";
import { api,data } from "@/server/http";
import { requireActor } from "@/server/identity/actor";

export const GET=api(async(request,context,route:AcademicIdRoute)=>{
  const page=await listExamMarks(await requireActor(request,context),await academicId(route),academicQuery(request,examRosterQuery));
  return data(page.items,200,{nextCursor:page.nextCursor});
});
