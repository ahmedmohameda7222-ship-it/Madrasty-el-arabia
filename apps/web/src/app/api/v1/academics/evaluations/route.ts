import { evaluationCreate,evaluationListQuery } from "@madrasty/contracts";
import { listEvaluations,writeEvaluation } from "@/server/academics/evaluations";
import { academicQuery } from "@/server/academics/route-params";
import { api,data,readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";

export const GET=api(async(request,context)=>{
  const page=await listEvaluations(await requireActor(request,context),academicQuery(request,evaluationListQuery));
  return data(page.items,200,{nextCursor:page.nextCursor});
});
export const POST=api(async(request,context)=>{
  const actor=await requireActor(request,context),input=await readJson(request,evaluationCreate,80*1024);
  return data((await writeEvaluation(actor,request.headers.get("idempotency-key"),input)).data,201);
});
