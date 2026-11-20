import {readBroadcastOptions} from "@/server/comms/broadcasts";
import {api,data} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const GET=api(async(request,context)=>data(await readBroadcastOptions(await requireActor(request,context))));
