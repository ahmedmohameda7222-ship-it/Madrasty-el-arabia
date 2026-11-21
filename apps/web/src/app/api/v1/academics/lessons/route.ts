import { lessonCreate,lessonListQuery } from "@madrasty/contracts";
import { listCurriculumLessons,saveCurriculumLesson } from "@/server/academics/curriculum";
import { academicQuery } from "@/server/academics/route-params";
import { api,data,readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";

export const GET=api(async(request,context)=>{
  const actor=await requireActor(request,context);
  const page=await listCurriculumLessons(actor,academicQuery(request,lessonListQuery));
  return data(page.items,200,{nextCursor:page.nextCursor});
});
export const POST=api(async(request,context)=>{
  const actor=await requireActor(request,context);
  const input=await readJson(request,lessonCreate,160*1024);
  return data((await saveCurriculumLesson(actor,request.headers.get("idempotency-key"),input)).data,201);
});
