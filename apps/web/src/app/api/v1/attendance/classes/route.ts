import { attendanceDate } from "@madrasty/contracts";
import { ApiError, api, data } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { readAttendanceClasses } from "@/server/attendance/sheets";

export const GET=api(async(request,context)=>{
  const actor=await requireActor(request,context);
  const query=attendanceDate.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if(!query.success)throw new ApiError("validation");
  return data(await readAttendanceClasses(actor,query.data.date));
});
