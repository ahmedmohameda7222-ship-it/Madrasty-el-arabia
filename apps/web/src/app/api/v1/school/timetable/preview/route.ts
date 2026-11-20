import { timetablePreviewInput } from "@madrasty/contracts";
import { api, data, readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { previewTimetable } from "@/server/school/timetable";

export const POST=api(async(request,context)=>{
  const actor=await requireActor(request,context);
  return data(await previewTimetable(actor,await readJson(request,timetablePreviewInput)));
});
