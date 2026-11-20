import { attendanceEditInput } from "@madrasty/contracts";
import { api, data, readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { attendanceSheetId, type AttendanceSheetRoute } from "@/server/attendance/route-params";
import { editAttendanceRows } from "@/server/attendance/sheets";

export const PATCH=api(async(request,context,route:AttendanceSheetRoute)=>{
  const actor=await requireActor(request,context);
  const input=await readJson(request,attendanceEditInput);
  const id=await attendanceSheetId(route);
  return data((await editAttendanceRows(actor,id,request.headers.get("idempotency-key"),input)).data);
});
