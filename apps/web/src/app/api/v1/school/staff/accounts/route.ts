import { api, data } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { staffAccounts } from "@/server/school/assignments";

export const GET=api(async(request,ctx)=>data(await staffAccounts(await requireActor(request,ctx))));
