import { childAttendanceQuery } from "@madrasty/contracts";
import { z } from "zod";
import { ApiError,api,data } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { childHistory } from "@/server/attendance/history";

type Route={params:Promise<{childId:string}>};
export const GET=api(async(request,context,route:Route)=>{
  const actor=await requireActor(request,context);
  const id=z.uuid().safeParse((await route.params).childId);
  if(!id.success)throw new ApiError("not_found");
  const input=childAttendanceQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if(!input.success)throw new ApiError("validation");
  const result=await childHistory(actor,id.data,input.data);
  return data(result.page,200,result.nextCursor?{nextCursor:result.nextCursor}:undefined);
});
