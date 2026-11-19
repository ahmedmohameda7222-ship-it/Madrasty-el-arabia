import { api, data } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { myTeaching } from "@/server/school/assignments";

export const GET=api(async(request,ctx)=>data(await myTeaching(await requireActor(request,ctx))));
