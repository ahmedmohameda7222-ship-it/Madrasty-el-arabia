import {z} from "zod";
import {ApiError,api,data} from "@/server/http";
import {requireActor} from "@/server/identity/actor";
import {adminStudent} from "@/server/school/class-monitor";
type StudentRoute={params:Promise<{classId:string;studentId:string}>};

export const GET=api(async(request,ctx,route:StudentRoute)=>{
  const parts=await route.params;
  const classroom=z.uuid().safeParse(parts.classId),student=z.uuid().safeParse(parts.studentId);
  if(!classroom.success||!student.success)throw new ApiError("validation");
  return data(await adminStudent(await requireActor(request,ctx),classroom.data,student.data));
});
