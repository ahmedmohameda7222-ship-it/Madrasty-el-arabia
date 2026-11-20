import {deliveryHistoryQuery} from "@madrasty/contracts";
import {academicQuery} from "@/server/academics/route-params";
import {listDeliveryStatus} from "@/server/comms/delivery-status";
import {api,data} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const GET=api(async(request,context)=>{
  const page=await listDeliveryStatus(await requireActor(request,context),academicQuery(request,deliveryHistoryQuery));
  return data(page.items,200,{nextCursor:page.nextCursor});
});
