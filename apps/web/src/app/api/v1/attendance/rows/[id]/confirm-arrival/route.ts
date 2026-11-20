import { actualArrivalInput } from "@madrasty/contracts";
import { api, data, readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { attendanceSheetId, type AttendanceSheetRoute } from "@/server/attendance/route-params";
import { confirmArrival } from "@/server/attendance/excuses";

export const POST=api(async(request,context,route:AttendanceSheetRoute)=>{
  const actor=await requireActor(request,context);
  const id=await attendanceSheetId(route);
  const input=await readJson(request,actualArrivalInput);
  return data((await confirmArrival(actor,id,request.headers.get("idempotency-key"),input)).data);
});
