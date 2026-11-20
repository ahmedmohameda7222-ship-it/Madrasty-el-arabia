import { academicChildQuery } from "@madrasty/contracts";
import { listCurriculumOfferings } from "@/server/academics/curriculum";
import { academicQuery } from "@/server/academics/route-params";
import { api,data } from "@/server/http";
import { requireActor } from "@/server/identity/actor";

export const GET=api(async(request,context)=>{
  const actor=await requireActor(request,context);
  return data(await listCurriculumOfferings(actor,academicQuery(request,academicChildQuery).childId));
});
