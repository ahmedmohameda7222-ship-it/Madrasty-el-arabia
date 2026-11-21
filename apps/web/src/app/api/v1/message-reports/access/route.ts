import {canManageMessageReports} from "@/server/comms/moderation";
import {api,data} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const GET=api(async(request,context)=>data({allowed:await canManageMessageReports(await requireActor(request,context))}));
