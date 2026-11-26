import {z} from "zod";
import {ApiError,api,data,readJson} from "@/server/http";
import {requireActor} from "@/server/identity/actor";
import {readFamilyGroup,editFamilyGroup} from "@/server/school/families";
export const GET=api(async(request,ctx,route:{params:Promise<{id:string}>})=>{const actor=await requireActor(request,ctx);const id=z.uuid().safeParse((await route.params).id);if(!id.success)throw new ApiError("not_found");return data(await readFamilyGroup(actor,id.data));});

import {familyGroupEdit} from "@madrasty/contracts";
export const PATCH=api(async(request,ctx,route:{params:Promise<{id:string}>})=>{const actor=await requireActor(request,ctx);const id=z.uuid().safeParse((await route.params).id);if(!id.success)throw new ApiError("not_found");return data(await editFamilyGroup(actor,id.data,request.headers.get("idempotency-key"),await readJson(request,familyGroupEdit)));});
