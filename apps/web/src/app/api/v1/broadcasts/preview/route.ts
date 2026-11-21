import {broadcastDraft} from "@madrasty/contracts";
import {previewBroadcast} from "@/server/comms/broadcasts";
import {api,data,readJson} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const POST=api(async(request,context)=>{
  const actor=await requireActor(request,context);
  return data(await previewBroadcast(actor,await readJson(request,broadcastDraft)),201);
});
