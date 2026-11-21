import "server-only";
import { schoolDateSchema } from "@madrasty/contracts";
import { z } from "zod";
import { ApiError } from "@/server/http";

export type AttendanceClassRoute = {params:Promise<{classId:string;date:string}>};
export type AttendanceSheetRoute = {params:Promise<{id:string}>};
const classDay = z.object({classId:z.uuid(),date:schoolDateSchema});

export async function attendanceClassDay(route:AttendanceClassRoute){
  const result=classDay.safeParse(await route.params);
  if(!result.success)throw new ApiError("not_found");
  return result.data;
}

export async function attendanceSheetId(route:AttendanceSheetRoute){
  const result=z.uuid().safeParse((await route.params).id);
  if(!result.success)throw new ApiError("not_found");
  return result.data;
}
