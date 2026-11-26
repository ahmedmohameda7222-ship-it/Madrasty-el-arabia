import {z} from "zod";
import {familyGroupAttach} from "@madrasty/contracts";
import {ApiError,api,data,readJson} from "@/server/http";
import {requireActor} from "@/server/identity/actor";
import {attachFamilyMember} from "@/server/school/families";
export const POST=api(async(request,ctx,route:{params:Promise<{id:string}>})=>{const actor=await requireActor(request,ctx);const id=z.uuid().safeParse((await route.params).id);if(!id.success)throw new ApiError("not_found");const result=await attachFamilyMember(actor,id.data,request.headers.get("idempotency-key"),await readJson(request,familyGroupAttach));return data(result);});
