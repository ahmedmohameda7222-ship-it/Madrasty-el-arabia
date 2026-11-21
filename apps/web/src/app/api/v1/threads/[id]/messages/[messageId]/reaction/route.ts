import { reactionInput } from "@madrasty/contracts";
import { z } from "zod";
import { reactToMessage } from "@/server/comms/messages";
import { ApiError,api,data,readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";

type Route={params:Promise<{id:string;messageId:string}>};
export const PUT=api(async(request,context,route:Route)=>{
  const actor=await requireActor(request,context),params=z.object({id:z.uuid(),messageId:z.uuid()}).safeParse(await route.params);
  if(!params.success)throw new ApiError("not_found");
  const changes=await readJson(request,reactionInput);
  return data(await reactToMessage(actor,params.data.id,params.data.messageId,changes));
});
