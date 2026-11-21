import { timetablePatchInput } from "@madrasty/contracts";
import { z } from "zod";
import { ApiError, api, data, readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { readSlot, updateSlot } from "@/server/school/timetable";

type Route={params:Promise<{id:string}>};
async function slotId(route: Route){
  const id=z.uuid().safeParse((await route.params).id);
  if(!id.success)throw new ApiError("not_found");
  return id.data;
}
export const GET=api(async(request,context,route:Route)=>
  data(await readSlot(await requireActor(request,context),await slotId(route))));

export const PATCH=api(async(request,context,route:Route)=>{
  const actor=await requireActor(request,context);
  return data((await updateSlot(actor,await slotId(route),request.headers.get("idempotency-key"),
    await readJson(request,timetablePatchInput))).data);
});
