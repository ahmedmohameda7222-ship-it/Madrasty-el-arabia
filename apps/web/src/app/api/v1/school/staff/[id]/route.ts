import { staffChangeInput } from "@madrasty/contracts";
import { z } from "zod";
import { ApiError, api, data, readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { changeStaff, readStaff } from "@/server/school/assignments";

type Route={params:Promise<{id:string}>};
async function getId(route: Route){
  const id=z.uuid().safeParse((await route.params).id);
  if(!id.success) throw new ApiError("not_found");
  return id.data;
}

export const GET=api(async(request,ctx,route:Route)=>data(await readStaff(await requireActor(request,ctx),await getId(route))));

export const PATCH=api(async(request,ctx,route:Route)=>{
  const actor=await requireActor(request,ctx);
  const result=await changeStaff(actor,await getId(route),request.headers.get("idempotency-key"),await readJson(request,staffChangeInput));
  return data(result.data);
});
