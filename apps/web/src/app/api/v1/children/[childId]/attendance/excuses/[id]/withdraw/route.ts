import { withdrawExcuseInput } from "@madrasty/contracts";
import { z } from "zod";
import { ApiError, api, data, readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { withdrawFamilyExcuse } from "@/server/attendance/excuses";

type Route={params:Promise<{childId:string;id:string}>};
const ids=z.object({childId:z.uuid(),id:z.uuid()});
export const POST=api(async(request,context,route:Route)=>{
  const actor=await requireActor(request,context);
  const result=ids.safeParse(await route.params);
  if(!result.success)throw new ApiError("not_found");
  const {revision}=await readJson(request,withdrawExcuseInput);
  const {childId,id}=result.data;
  const updated=await withdrawFamilyExcuse(actor,childId,id,request.headers.get("idempotency-key"),revision);
  return data(updated.data);
});
