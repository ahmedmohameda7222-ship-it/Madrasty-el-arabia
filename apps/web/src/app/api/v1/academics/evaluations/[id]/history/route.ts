import { readEvaluationHistory } from "@/server/academics/evaluations";
import { academicId,type AcademicIdRoute } from "@/server/academics/route-params";
import { api,data } from "@/server/http";
import { requireActor } from "@/server/identity/actor";

export const GET=api(async(request,context,route:AcademicIdRoute)=>
  data(await readEvaluationHistory(await requireActor(request,context),await academicId(route))));
