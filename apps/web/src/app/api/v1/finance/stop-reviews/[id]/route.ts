import {stopResolution} from "@madrasty/contracts";
import {academicId,type AcademicIdRoute} from "@/server/academics/route-params";
import {completeStopReview,loadStopReview} from "@/server/finance/stopReconciliation";
import {api,data,readJson} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const GET=api(async(request,context,route:AcademicIdRoute)=>
  data(await loadStopReview(await requireActor(request,context),await academicId(route))));
export const PATCH=api(async(request,context,route:AcademicIdRoute)=>
  data(await completeStopReview(await requireActor(request,context),await academicId(route),
    request.headers.get("idempotency-key"),await readJson(request,stopResolution,16384))));
