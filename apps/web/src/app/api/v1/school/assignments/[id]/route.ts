import { assignmentChangeInput } from "@madrasty/contracts";
import { z } from "zod";
import { ApiError, api, data, readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { changeAssignment } from "@/server/school/assignments";

export const PATCH=api(async(request,ctx,route:{params:Promise<{id:string}>})=>{
  const actor=await requireActor(request,ctx);
  const id=z.uuid().safeParse((await route.params).id);
  if(!id.success) throw new ApiError("not_found");
  const result=await changeAssignment(actor,id.data,request.headers.get("idempotency-key"),await readJson(request,assignmentChangeInput));
  return data(result.data);
});
