import {z} from "zod";
import {familyGroupGuardianInput} from "@madrasty/contracts";
import {ApiError,api,data,readJson} from "@/server/http";
import {requireActor} from "@/server/identity/actor";
import {createGroupGuardian} from "@/server/school/families";
export const POST=api(async(request,ctx,route:{params:Promise<{id:string}>})=>{const actor=await requireActor(request,ctx);const id=z.uuid().safeParse((await route.params).id);if(!id.success)throw new ApiError("not_found");const result=await createGroupGuardian(actor,id.data,request.headers.get("idempotency-key"),await readJson(request,familyGroupGuardianInput));return data(result.data,result.replayed?200:201);});
