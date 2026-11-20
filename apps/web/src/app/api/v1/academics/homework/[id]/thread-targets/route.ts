import { academicId,type AcademicIdRoute } from "@/server/academics/route-params";
import { homeworkContacts } from "@/server/comms/threads";
import { api,data } from "@/server/http";
import { requireActor } from "@/server/identity/actor";

export const GET=api(async(request,context,route:AcademicIdRoute)=>
  data(await homeworkContacts(await requireActor(request,context),await academicId(route))));
