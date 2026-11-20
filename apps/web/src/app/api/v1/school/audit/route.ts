import { auditQuery } from "@madrasty/contracts";
import { ApiError, api, data } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { readSchoolAudit } from "@/server/school/audit";

export const GET=api(async(request,context)=>{
  const actor=await requireActor(request,context);
  const query=auditQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if(!query.success)throw new ApiError("validation");
  const result=await readSchoolAudit(actor,query.data);
  return data(result.entries,200,result.nextCursor?{nextCursor:result.nextCursor}:undefined);
});
