import { timetableSaveInput, timetableWeekQuery } from "@madrasty/contracts";
import { ApiError, api, data, readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { readTimetableWeek, saveTimetable } from "@/server/school/timetable";

export const GET=api(async(request,context)=>{
  const actor=await requireActor(request,context);
  const query=timetableWeekQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if(!query.success)throw new ApiError("validation");
  return data(await readTimetableWeek(actor,query.data));
});

export const POST=api(async(request,context)=>{
  const actor=await requireActor(request,context);
  const result=await saveTimetable(actor,request.headers.get("idempotency-key"),await readJson(request,timetableSaveInput));
  return data(result.data,result.replayed?200:201);
});
