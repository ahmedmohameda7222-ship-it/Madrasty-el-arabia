import { auditFiltersQuery } from "@madrasty/contracts";
import { ApiError, api, data } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { readAuditFilters } from "@/server/school/audit";

export const GET=api(async(request,context)=>{
  const actor=await requireActor(request,context);
  const query=auditFiltersQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if(!query.success)throw new ApiError("validation");
  return data(await readAuditFilters(actor,query.data));
});
