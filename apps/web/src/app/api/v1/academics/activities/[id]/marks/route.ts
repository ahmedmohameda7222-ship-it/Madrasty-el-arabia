import { activityRosterQuery } from "@madrasty/contracts";
import { activityRoster } from "@/server/academics/teaching-activity";
import { academicId,academicQuery,type AcademicIdRoute } from "@/server/academics/route-params";
import { api,data } from "@/server/http";
import { requireActor } from "@/server/identity/actor";

export const GET=api(async(request,context,route:AcademicIdRoute)=>{
  const actor=await requireActor(request,context);
  const page=await activityRoster(actor,await academicId(route),academicQuery(request,activityRosterQuery));
  return data(page.items,200,{nextCursor:page.nextCursor});
});
