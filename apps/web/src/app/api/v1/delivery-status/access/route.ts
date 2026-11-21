import {canViewDeliveryStatus} from "@/server/comms/delivery-status";
import {api,data} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const GET=api(async(request,context)=>data({allowed:await canViewDeliveryStatus(await requireActor(request,context))}));
