import { academicChildQuery } from "@madrasty/contracts";
import { activityById } from "@/server/academics/teaching-activity";
import { academicId,academicQuery,type AcademicIdRoute } from "@/server/academics/route-params";
import { api,data } from "@/server/http";
import { requireActor } from "@/server/identity/actor";

export const GET=api(async(request,context,route:AcademicIdRoute)=>{
  const actor=await requireActor(request,context);
  return data(await activityById(actor,await academicId(route),academicQuery(request,academicChildQuery).childId));
});
