import {unreadThreadCount} from "@/server/comms/threads";
import {api,data} from "@/server/http";
import {requireActor} from "@/server/identity/actor";
export const GET=api(async(request,context)=>data(await unreadThreadCount(await requireActor(request,context))));
