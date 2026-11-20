import { roomInput } from "@madrasty/contracts";
import { api, data, readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { createRoom, listRooms } from "@/server/school/timetable";

export const GET=api(async(request,context)=>data(await listRooms(await requireActor(request,context))));

export const POST=api(async(request,context)=>{
  const actor=await requireActor(request,context);
  const result=await createRoom(actor,request.headers.get("idempotency-key"),await readJson(request,roomInput));
  return data(result.data,result.replayed?200:201);
});
