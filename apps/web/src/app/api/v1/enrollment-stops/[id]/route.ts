import {stopWithdraw} from "@madrasty/contracts";
import {academicId,type AcademicIdRoute} from "@/server/academics/route-params";
import {changeEnrollmentStop,readEnrollmentStop} from "@/server/finance/stops";
import {api,data,readJson} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const GET=api(async(request,context,route:AcademicIdRoute)=>
  data(await readEnrollmentStop(await requireActor(request,context),await academicId(route))));
export const PATCH=api(async(request,context,route:AcademicIdRoute)=>
  data(await changeEnrollmentStop(await requireActor(request,context),await academicId(route),
    request.headers.get("idempotency-key"),await readJson(request,stopWithdraw,2048))));
