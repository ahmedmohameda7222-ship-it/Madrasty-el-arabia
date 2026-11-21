import {unreadNoticeCount} from "@/server/comms/notifications";
import {api,data} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const GET=api(async(request,context)=>data(await unreadNoticeCount(await requireActor(request,context))));
