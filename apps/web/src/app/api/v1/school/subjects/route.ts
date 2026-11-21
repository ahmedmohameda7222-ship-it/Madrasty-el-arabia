import { api, data } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { listSubjects } from "@/server/school/assignments";

export const GET=api(async(request,ctx)=>data(await listSubjects(await requireActor(request,ctx))));
