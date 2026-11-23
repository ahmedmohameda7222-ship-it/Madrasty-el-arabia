import {z} from "zod";
import {ApiError,api,data} from "@/server/http";
import {requireActor} from "@/server/identity/actor";
import {adminClasses} from "@/server/school/class-monitor";

export const GET=api(async(request,ctx)=>{
  const id=z.uuid().safeParse(new URL(request.url).searchParams.get("yearId"));
  if(!id.success)throw new ApiError("validation");
  return data(await adminClasses(await requireActor(request,ctx),id.data));
});
