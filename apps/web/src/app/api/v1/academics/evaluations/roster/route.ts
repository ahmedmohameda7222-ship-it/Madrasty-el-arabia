import { assessmentRosterQuery } from "@madrasty/contracts";
import { assessmentRoster } from "@/server/academics/evaluations";
import { academicQuery } from "@/server/academics/route-params";
import { api,data } from "@/server/http";
import { requireActor } from "@/server/identity/actor";

export const GET=api(async(request,context)=>{
  const page=await assessmentRoster(await requireActor(request,context),academicQuery(request,assessmentRosterQuery));
  return data(page.items,200,{nextCursor:page.nextCursor});
});
