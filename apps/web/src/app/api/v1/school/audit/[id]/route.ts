import { localeSchema } from "@madrasty/contracts";
import { z } from "zod";
import { ApiError, api, data } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { readAuditEntry } from "@/server/school/audit";

type Route={params:Promise<{id:string}>};
export const GET=api(async(request,context,route:Route)=>{
  const actor=await requireActor(request,context);
  const id=z.uuid().safeParse((await route.params).id);
  if(!id.success)throw new ApiError("not_found");
  const locale=localeSchema.safeParse(new URL(request.url).searchParams.get("locale")??"ar");
  if(!locale.success)throw new ApiError("validation");
  return data(await readAuditEntry(actor,id.data,locale.data));
});
