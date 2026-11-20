import {stopRefund} from "@madrasty/contracts";
import {academicId,type AcademicIdRoute} from "@/server/academics/route-params";
import {saveStopRefund} from "@/server/finance/stopReconciliation";
import {api,data,readJson} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const POST=api(async(request,context,route:AcademicIdRoute)=>
  data(await saveStopRefund(await requireActor(request,context),await academicId(route),
    request.headers.get("idempotency-key"),await readJson(request,stopRefund,8192)),201));
