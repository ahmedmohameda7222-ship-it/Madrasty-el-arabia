import { attendancePendingQuery } from "@madrasty/contracts";
import { ApiError, api, data } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { readPendingSheets } from "@/server/attendance/sheets";

export const GET=api(async(request,context)=>{
  const actor=await requireActor(request,context);
  const query=attendancePendingQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if(!query.success)throw new ApiError("validation");
  const result=await readPendingSheets(actor,query.data);
  return data(result.page,200,result.nextCursor?{nextCursor:result.nextCursor}:undefined);
});
