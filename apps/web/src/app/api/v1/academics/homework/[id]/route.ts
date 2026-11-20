import { academicChildQuery,homeworkChange } from "@madrasty/contracts";
import { readHomework,writeHomework } from "@/server/academics/homework";
import { academicId,academicQuery,type AcademicIdRoute } from "@/server/academics/route-params";
import { api,data,readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";

export const GET=api(async(request,context,route:AcademicIdRoute)=>{
  const actor=await requireActor(request,context);
  return data(await readHomework(actor,await academicId(route),academicQuery(request,academicChildQuery).childId));
});
export const PATCH=api(async(request,context,route:AcademicIdRoute)=>{
  const actor=await requireActor(request,context),id=await academicId(route),input=await readJson(request,homeworkChange,80*1024);
  return data((await writeHomework(actor,request.headers.get("idempotency-key"),input,id)).data);
});
