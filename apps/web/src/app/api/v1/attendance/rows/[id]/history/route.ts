import { api,data } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { attendanceSheetId,type AttendanceSheetRoute } from "@/server/attendance/route-params";
import { attendanceRowHistory } from "@/server/attendance/history";

export const GET=api(async(request,context,route:AttendanceSheetRoute)=>{
  const actor=await requireActor(request,context);
  return data(await attendanceRowHistory(actor,await attendanceSheetId(route)));
});
