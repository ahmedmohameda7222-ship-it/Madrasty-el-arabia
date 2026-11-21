import {stopReviewQuery} from "@madrasty/contracts";
import {academicQuery} from "@/server/academics/route-params";
import {listStopReviews} from "@/server/finance/stopReconciliation";
import {api,data} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const GET=api(async(request,context)=>{
  const page=await listStopReviews(await requireActor(request,context),academicQuery(request,stopReviewQuery));
  return data(page.items,200,{nextCursor:page.nextCursor});
});
