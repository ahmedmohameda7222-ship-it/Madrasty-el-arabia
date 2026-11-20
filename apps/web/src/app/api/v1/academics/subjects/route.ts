import { curriculumSubjectCreate,curriculumSubjectsQuery } from "@madrasty/contracts";
import { createCurriculumSubject,listCurriculumSubjects } from "@/server/academics/curriculum";
import { academicQuery } from "@/server/academics/route-params";
import { api,data,readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";

export const GET=api(async(request,context)=>{
  const actor=await requireActor(request,context);
  const page=await listCurriculumSubjects(actor,academicQuery(request,curriculumSubjectsQuery));
  return data(page.items,200,{nextCursor:page.nextCursor});
});
export const POST=api(async(request,context)=>{
  const actor=await requireActor(request,context);
  const input=await readJson(request,curriculumSubjectCreate);
  return data((await createCurriculumSubject(actor,request.headers.get("idempotency-key"),input)).data,201);
});
