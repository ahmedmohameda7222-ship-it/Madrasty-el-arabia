import { api, data } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { attendanceSheetId, type AttendanceSheetRoute } from "@/server/attendance/route-params";
import { readStaffAttendanceRow } from "@/server/attendance/excuses";

export const GET=api(async(request,context,route:AttendanceSheetRoute)=>{
  const actor=await requireActor(request,context);
  const id=await attendanceSheetId(route);
  const includeReason=new URL(request.url).searchParams.get("detail")==="private";
  return data(await readStaffAttendanceRow(actor,id,includeReason));
});
