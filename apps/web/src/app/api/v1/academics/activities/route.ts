import { activityCreate,activityQuery } from "@madrasty/contracts";
import { activities,createActivity } from "@/server/academics/teaching-activity";
import { academicQuery } from "@/server/academics/route-params";
import { api,data,readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";

export const GET=api(async(request,context)=>{
  const page=await activities(await requireActor(request,context),academicQuery(request,activityQuery));
  return data(page.items,200,{nextCursor:page.nextCursor});
});
export const POST=api(async(request,context)=>{
  const actor=await requireActor(request,context),input=await readJson(request,activityCreate);
  return data((await createActivity(actor,request.headers.get("idempotency-key"),input)).data,201);
});
