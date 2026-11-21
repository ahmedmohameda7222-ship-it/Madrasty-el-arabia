import {loadStopOptions} from "@/server/finance/stops";
import {api,data} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const GET=api(async(request,context)=>data(await loadStopOptions(await requireActor(request,context))));
