import {broadcastPublish,pageQuerySchema} from "@madrasty/contracts";
import {academicQuery} from "@/server/academics/route-params";
import {listSentBroadcasts,publishBroadcast} from "@/server/comms/broadcasts";
import {api,data,readJson} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const GET=api(async(request,context)=>{
  const page=await listSentBroadcasts(await requireActor(request,context),academicQuery(request,pageQuerySchema));
  return data(page.items,200,{nextCursor:page.nextCursor});
});
export const POST=api(async(request,context)=>{
  const actor=await requireActor(request,context);
  const input=await readJson(request,broadcastPublish,2048);
  return data(await publishBroadcast(actor,request.headers.get("idempotency-key"),input.previewId),201);
});
