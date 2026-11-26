import {api,data} from "@/server/http";
import {requireActor} from "@/server/identity/actor";
import {readFamilyOverview} from "@/server/school/families";
export const GET=api(async(request,ctx)=>data(await readFamilyOverview(await requireActor(request,ctx))));
