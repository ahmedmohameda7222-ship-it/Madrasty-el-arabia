import {z} from "zod";
import {ApiError,api,data} from "@/server/http";
import {requireActor} from "@/server/identity/actor";
import {familyImportStatus} from "@/server/school/imports";
export const GET=api(async(request,ctx,route:{params:Promise<{id:string}>})=>{const actor=await requireActor(request,ctx);const id=z.uuid().safeParse((await route.params).id);if(!id.success)throw new ApiError("not_found");return data(await familyImportStatus(actor,id.data));});
