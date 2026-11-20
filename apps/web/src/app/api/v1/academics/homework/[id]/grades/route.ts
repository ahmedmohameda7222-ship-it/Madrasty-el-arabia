import { homeworkGradeRosterQuery } from "@madrasty/contracts";
import { gradingRoster } from "@/server/academics/gradebook";
import { academicId,academicQuery,type AcademicIdRoute } from "@/server/academics/route-params";
import { api,data } from "@/server/http";
import { requireActor } from "@/server/identity/actor";

export const GET=api(async(request,context,route:AcademicIdRoute)=>{
  const page=await gradingRoster(await requireActor(request,context),await academicId(route),academicQuery(request,homeworkGradeRosterQuery));
  return data(page.items,200,{nextCursor:page.nextCursor});
});
