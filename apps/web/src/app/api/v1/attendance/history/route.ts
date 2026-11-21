import { staffAttendanceQuery } from "@madrasty/contracts";
import { ApiError,api,data } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { staffHistory } from "@/server/attendance/history";

export const GET=api(async(request,context)=>{
  const actor=await requireActor(request,context);
  const input=staffAttendanceQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if(!input.success)throw new ApiError("validation");
  const result=await staffHistory(actor,input.data);
  return data(result.entries,200,result.nextCursor?{nextCursor:result.nextCursor}:undefined);
});
