import {academicId,type AcademicIdRoute} from "@/server/academics/route-params";
import {loadReceipt} from "@/server/finance/receipts";
import {api,data} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const GET=api(async(request,context,route:AcademicIdRoute)=>
  data(await loadReceipt(await requireActor(request,context),await academicId(route))));
