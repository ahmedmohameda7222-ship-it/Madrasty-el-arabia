import { lessonPublish } from "@madrasty/contracts";
import { publishCurriculumLesson } from "@/server/academics/curriculum";
import { academicId,type AcademicIdRoute } from "@/server/academics/route-params";
import { api,data,readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";

export const POST=api(async(request,context,route:AcademicIdRoute)=>{
  const actor=await requireActor(request,context);
  const id=await academicId(route),input=await readJson(request,lessonPublish);
  return data((await publishCurriculumLesson(actor,id,request.headers.get("idempotency-key"),input.revision)).data);
});
