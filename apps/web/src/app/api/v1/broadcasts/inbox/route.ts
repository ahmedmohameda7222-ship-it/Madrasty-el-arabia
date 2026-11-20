import {broadcastQuery} from "@madrasty/contracts";
import {academicQuery} from "@/server/academics/route-params";
import {listReceivedBroadcasts} from "@/server/comms/broadcasts";
import {api,data} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const GET=api(async(request,context)=>{
  const page=await listReceivedBroadcasts(await requireActor(request,context),academicQuery(request,broadcastQuery));
  return data(page.items,200,{nextCursor:page.nextCursor});
});
