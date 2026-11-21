import { substituteInput } from "@madrasty/contracts";
import { z } from "zod";
import { ApiError, api, data, readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { addSubstitute } from "@/server/school/assignments";

export const POST=api(async(request,ctx,route:{params:Promise<{id:string}>})=>{
  const actor=await requireActor(request,ctx);
  const id=z.uuid().safeParse((await route.params).id);
  if(!id.success) throw new ApiError("not_found");
  const result=await addSubstitute(actor,id.data,request.headers.get("idempotency-key"),await readJson(request,substituteInput));
  return data(result.data,result.replayed?200:201);
});
