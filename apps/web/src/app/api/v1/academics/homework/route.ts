import { homeworkCreate,homeworkListQuery } from "@madrasty/contracts";
import { listHomework,writeHomework } from "@/server/academics/homework";
import { academicQuery } from "@/server/academics/route-params";
import { api,data,readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";

export const GET=api(async(request,context)=>{
  const page=await listHomework(await requireActor(request,context),academicQuery(request,homeworkListQuery));
  return data(page.items,200,{nextCursor:page.nextCursor});
});
export const POST=api(async(request,context)=>{
  const actor=await requireActor(request,context),input=await readJson(request,homeworkCreate,80*1024);
  return data((await writeHomework(actor,request.headers.get("idempotency-key"),input)).data,201);
});
