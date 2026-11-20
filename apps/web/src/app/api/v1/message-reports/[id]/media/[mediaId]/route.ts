import {viewPrivateMedia} from "@/server/comms/media";
import {mediaParams,type MediaRoute} from "@/server/comms/media-params";
import {api} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const GET=api(async(request,context,route:MediaRoute)=>{
  const actor=await requireActor(request,context),{id,objectId}=await mediaParams(route,"mediaId");
  return viewPrivateMedia(actor,{reportId:id},objectId,request);
});
export const HEAD=GET;
