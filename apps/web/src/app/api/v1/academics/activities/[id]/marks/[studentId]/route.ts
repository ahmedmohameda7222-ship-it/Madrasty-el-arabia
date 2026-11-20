import { activityMarkInput } from "@madrasty/contracts";
import { activityHistory,setActivityMark } from "@/server/academics/teaching-activity";
import { academicPupil,type AcademicPupilRoute } from "@/server/academics/route-params";
import { api,data,readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";

export const GET=api(async(request,context,route:AcademicPupilRoute)=>{
  const actor=await requireActor(request,context);
  const {id,studentId}=await academicPupil(route);
  return data(await activityHistory(actor,id,studentId));
});
export const PUT=api(async(request,context,route:AcademicPupilRoute)=>{
  const actor=await requireActor(request,context);
  const {id,studentId}=await academicPupil(route),input=await readJson(request,activityMarkInput);
  return data((await setActivityMark(actor,id,studentId,request.headers.get("idempotency-key"),input)).data);
});
