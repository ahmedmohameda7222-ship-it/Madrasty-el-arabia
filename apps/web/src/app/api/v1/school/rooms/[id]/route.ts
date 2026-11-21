import { roomChangeInput } from "@madrasty/contracts";
import { z } from "zod";
import { ApiError, api, data, readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { updateRoom } from "@/server/school/timetable";

type Route={params:Promise<{id:string}>};
export const PATCH=api(async(request,context,route:Route)=>{
  const actor=await requireActor(request,context);
  const id=z.uuid().safeParse((await route.params).id);
  if(!id.success)throw new ApiError("not_found");
  return data((await updateRoom(actor,id.data,request.headers.get("idempotency-key"),
    await readJson(request,roomChangeInput))).data);
});
