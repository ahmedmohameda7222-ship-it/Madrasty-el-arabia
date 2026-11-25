import {communicationFeedQuery} from "@madrasty/contracts";
import {academicQuery} from "@/server/academics/route-params";
import {communicationFeed} from "@/server/comms/feed";
import {api,data} from "@/server/http";
import {requireActor} from "@/server/identity/actor";
export const GET=api(async(request,context)=>{
  const page=await communicationFeed(await requireActor(request,context),academicQuery(request,communicationFeedQuery));
  return data(page.items,200,{nextCursor:page.nextCursor});
});
