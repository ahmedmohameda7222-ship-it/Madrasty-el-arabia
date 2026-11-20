import {broadcastQuery} from "@madrasty/contracts";
import {academicId,academicQuery,type AcademicIdRoute} from "@/server/academics/route-params";
import {readReceivedBroadcast} from "@/server/comms/broadcasts";
import {api,data} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const GET=api(async(request,context,route:AcademicIdRoute)=>data(await readReceivedBroadcast(
  await requireActor(request,context),await academicId(route),academicQuery(request,broadcastQuery.pick({locale:true})).locale,
)));
