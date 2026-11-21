import { api, data } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { attendanceClassDay, type AttendanceClassRoute } from "@/server/attendance/route-params";
import { openDailySheet } from "@/server/attendance/sheets";

export const POST=api(async(request,context,route:AttendanceClassRoute)=>{
  const actor=await requireActor(request,context);
  const {classId,date}=await attendanceClassDay(route);
  return data((await openDailySheet(actor,classId,date,request.headers.get("idempotency-key"))).data);
});
