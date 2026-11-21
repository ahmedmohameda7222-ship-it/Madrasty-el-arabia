import { attendanceCorrectionInput } from "@madrasty/contracts";
import { api,data,readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { attendanceSheetId,type AttendanceSheetRoute } from "@/server/attendance/route-params";
import { correctAttendance } from "@/server/attendance/history";

export const POST=api(async(request,context,route:AttendanceSheetRoute)=>{
  const actor=await requireActor(request,context);
  const id=await attendanceSheetId(route);
  const input=await readJson(request,attendanceCorrectionInput);
  return data((await correctAttendance(actor,id,request.headers.get("idempotency-key"),input)).data);
});
