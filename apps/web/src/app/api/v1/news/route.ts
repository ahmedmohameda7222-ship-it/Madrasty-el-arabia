import {newsQuery,newsDraft} from "@madrasty/contracts";
import {academicQuery} from "@/server/academics/route-params";
import {listSchoolPublishing,writeSchoolPublishing} from "@/server/comms/schoolPublishing";
import {api,data,readJson} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const GET=api(async(request,context)=>{
  const page=await listSchoolPublishing(await requireActor(request,context),"news",academicQuery(request,newsQuery));
  return data(page.items,200,{nextCursor:page.nextCursor});
});
export const POST=api(async(request,context)=>{
  const actor=await requireActor(request,context);
  return data(await writeSchoolPublishing(actor,"news",request.headers.get("idempotency-key"),await readJson(request,newsDraft)),201);
});
