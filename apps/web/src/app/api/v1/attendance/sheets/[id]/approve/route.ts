import { attendanceApproveInput } from "@madrasty/contracts";
import { api, data, readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { attendanceSheetId, type AttendanceSheetRoute } from "@/server/attendance/route-params";
import { approveAttendance } from "@/server/attendance/sheets";

export const POST=api(async(request,context,route:AttendanceSheetRoute)=>{
  const actor=await requireActor(request,context);
  const input=await readJson(request,attendanceApproveInput);
  const id=await attendanceSheetId(route);
  return data((await approveAttendance(actor,id,request.headers.get("idempotency-key"),input)).data);
});
