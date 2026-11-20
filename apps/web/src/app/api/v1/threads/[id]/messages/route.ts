import { chatMessagesQuery,postMessageInput } from "@madrasty/contracts";
import { academicId,academicQuery,type AcademicIdRoute } from "@/server/academics/route-params";
import { listMessages,sendMessage } from "@/server/comms/messages";
import { api,data,readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";

export const GET=api(async(request,context,route:AcademicIdRoute)=>{
  const page=await listMessages(await requireActor(request,context),await academicId(route),academicQuery(request,chatMessagesQuery));
  return data(page.items,200,{nextCursor:page.nextCursor});
});
export const POST=api(async(request,context,route:AcademicIdRoute)=>{
  const actor=await requireActor(request,context),id=await academicId(route),input=await readJson(request,postMessageInput);
  return data(await sendMessage(actor,id,request.headers.get("idempotency-key"),input),201);
});
