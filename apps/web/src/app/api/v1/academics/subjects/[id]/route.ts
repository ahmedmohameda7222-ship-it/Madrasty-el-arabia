import { academicChildQuery,curriculumSubjectChange } from "@madrasty/contracts";
import { changeCurriculumSubject,readCurriculumSubject } from "@/server/academics/curriculum";
import { academicId,academicQuery,type AcademicIdRoute } from "@/server/academics/route-params";
import { api,data,readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";

export const GET=api(async(request,context,route:AcademicIdRoute)=>{
  const actor=await requireActor(request,context);
  return data(await readCurriculumSubject(actor,await academicId(route),academicQuery(request,academicChildQuery).childId));
});
export const PATCH=api(async(request,context,route:AcademicIdRoute)=>{
  const actor=await requireActor(request,context);
  const id=await academicId(route),input=await readJson(request,curriculumSubjectChange);
  return data((await changeCurriculumSubject(actor,id,request.headers.get("idempotency-key"),input)).data);
});
