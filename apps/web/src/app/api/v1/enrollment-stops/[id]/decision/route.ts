import {stopDecision} from "@madrasty/contracts";
import {academicId,type AcademicIdRoute} from "@/server/academics/route-params";
import {changeEnrollmentStop} from "@/server/finance/stops";
import {api,data,readJson} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const POST=api(async(request,context,route:AcademicIdRoute)=>
  data(await changeEnrollmentStop(await requireActor(request,context),await academicId(route),
    request.headers.get("idempotency-key"),await readJson(request,stopDecision,8192))));
