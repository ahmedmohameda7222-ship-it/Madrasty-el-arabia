import {z} from "zod";
import {ApiError,api,data} from "@/server/http";
import {requireActor} from "@/server/identity/actor";
import {adminClass} from "@/server/school/class-monitor";
type ClassRoute={params:Promise<{classId:string}>};

export const GET=api(async(request,ctx,route:ClassRoute)=>{
  const id=z.uuid().safeParse((await route.params).classId);
  if(!id.success)throw new ApiError("validation");
  return data(await adminClass(await requireActor(request,ctx),id.data));
});
