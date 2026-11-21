import { academicId,type AcademicIdRoute } from "@/server/academics/route-params";
import { readThread } from "@/server/comms/threads";
import { api,data } from "@/server/http";
import { requireActor } from "@/server/identity/actor";

export const GET=api(async(request,context,route:AcademicIdRoute)=>
  data(await readThread(await requireActor(request,context),await academicId(route))));
