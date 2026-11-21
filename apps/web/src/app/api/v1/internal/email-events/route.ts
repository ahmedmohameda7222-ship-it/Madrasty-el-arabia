import {applyProviderEmailEvent} from "@/server/comms/dispatch";
import {api,data} from "@/server/http";

export const POST=api(async(request)=>data(await applyProviderEmailEvent(request)));
