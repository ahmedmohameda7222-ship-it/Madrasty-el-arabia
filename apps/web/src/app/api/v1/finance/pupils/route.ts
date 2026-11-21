import {billingPupilQuery} from "@madrasty/contracts";
import {academicQuery} from "@/server/academics/route-params";
import {financePupilOptions} from "@/server/finance/feeSettings";
import {api,data} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const GET=api(async(request,context)=>{
  const page=await financePupilOptions(await requireActor(request,context),academicQuery(request,billingPupilQuery));
  return data(page.items,200,{nextCursor:page.nextCursor});
});
