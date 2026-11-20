import {stopQuery,stopSubmit} from "@madrasty/contracts";
import {academicQuery} from "@/server/academics/route-params";
import {listEnrollmentStops,requestEnrollmentStop} from "@/server/finance/stops";
import {api,data,readJson} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const GET=api(async(request,context)=>{
  const page=await listEnrollmentStops(await requireActor(request,context),academicQuery(request,stopQuery));
  return data(page.items,200,{nextCursor:page.nextCursor});
});
export const POST=api(async(request,context)=>data(await requestEnrollmentStop(await requireActor(request,context),
  request.headers.get("idempotency-key"),await readJson(request,stopSubmit,8192)),201));
