import { startThreadInput,threadQuery } from "@madrasty/contracts";
import { academicQuery } from "@/server/academics/route-params";
import { startThread,threads } from "@/server/comms/threads";
import { api,data,readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";

export const GET=api(async(request,context)=>{
  const page=await threads(await requireActor(request,context),academicQuery(request,threadQuery));
  return data(page.items,200,{nextCursor:page.nextCursor});
});
export const POST=api(async(request,context)=>{
  const actor=await requireActor(request,context),input=await readJson(request,startThreadInput);
  return data((await startThread(actor,request.headers.get("idempotency-key"),input)).data);
});
