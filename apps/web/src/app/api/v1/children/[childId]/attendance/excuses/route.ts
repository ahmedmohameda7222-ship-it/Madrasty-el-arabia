import { familyExcuseInput, familyExcuseQuery } from "@madrasty/contracts";
import { z } from "zod";
import { ApiError, api, data, readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { readFamilyExcuses, submitFamilyExcuse } from "@/server/attendance/excuses";

type Route={params:Promise<{childId:string}>};
async function childId(route:Route){
  const id=z.uuid().safeParse((await route.params).childId);
  if(!id.success)throw new ApiError("not_found");
  return id.data;
}
export const GET=api(async(request,context,route:Route)=>{
  const actor=await requireActor(request,context);
  const input=familyExcuseQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if(!input.success)throw new ApiError("validation");
  return data(await readFamilyExcuses(actor,await childId(route),input.data.date));
});
export const POST=api(async(request,context,route:Route)=>{
  const actor=await requireActor(request,context);
  const result=await submitFamilyExcuse(actor,await childId(route),request.headers.get("idempotency-key"),await readJson(request,familyExcuseInput));
  return data(result.data,result.replayed?200:201);
});
