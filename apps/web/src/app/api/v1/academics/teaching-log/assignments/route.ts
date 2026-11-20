import { teachingAssignmentsQuery } from "@madrasty/contracts";
import { teachingAssignments } from "@/server/academics/teaching-activity";
import { academicQuery } from "@/server/academics/route-params";
import { api,data } from "@/server/http";
import { requireActor } from "@/server/identity/actor";

export const GET=api(async(request,context)=>{
  const actor=await requireActor(request,context);
  const {offeringId,date}=academicQuery(request,teachingAssignmentsQuery);
  return data(await teachingAssignments(actor,offeringId,date));
});
