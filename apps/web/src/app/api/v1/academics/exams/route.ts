import { examCreate,examListQuery } from "@madrasty/contracts";
import { listExams,saveExam } from "@/server/academics/exams";
import { academicQuery } from "@/server/academics/route-params";
import { readDecimalJson } from "@/server/academics/decimal-json";
import { api,data } from "@/server/http";
import { requireActor } from "@/server/identity/actor";

export const GET=api(async(request,context)=>{
  const page=await listExams(await requireActor(request,context),academicQuery(request,examListQuery));
  return data(page.items,200,{nextCursor:page.nextCursor});
});
export const POST=api(async(request,context)=>{
  const actor=await requireActor(request,context),input=await readDecimalJson(request,examCreate,["maxScore"]);
  return data((await saveExam(actor,request.headers.get("idempotency-key"),input)).data,201);
});
