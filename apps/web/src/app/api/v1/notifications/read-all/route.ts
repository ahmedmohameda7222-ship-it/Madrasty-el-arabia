import {markAllNoticesRead} from "@/server/comms/notifications";
import {api,data} from "@/server/http";
import {requireActor} from "@/server/identity/actor";
export const POST=api(async(request,context)=>data(await markAllNoticesRead(await requireActor(request,context))));
