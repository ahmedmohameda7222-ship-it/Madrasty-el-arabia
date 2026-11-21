import { teachingLogCreate,teachingLogQuery } from "@madrasty/contracts";
import { teachingLog,updateTeachingLog } from "@/server/academics/teaching-activity";
import { academicQuery } from "@/server/academics/route-params";
import { api,data,readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";

export const GET=api(async(request,context)=>{
  const page=await teachingLog(await requireActor(request,context),academicQuery(request,teachingLogQuery));
  return data(page.items,200,{nextCursor:page.nextCursor});
});
export const POST=api(async(request,context)=>{
  const actor=await requireActor(request,context);
  const input=await readJson(request,teachingLogCreate,80*1024);
  return data((await updateTeachingLog(actor,request.headers.get("idempotency-key"),input)).data,201);
});
