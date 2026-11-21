import {schoolPublishingOptions} from "@/server/comms/schoolPublishing";
import {api,data} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const GET=api(async(request,context)=>data(await schoolPublishingOptions(await requireActor(request,context))));
