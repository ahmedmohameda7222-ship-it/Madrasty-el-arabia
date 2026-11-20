import {noticeRead} from "@madrasty/contracts";
import {academicId,type AcademicIdRoute} from "@/server/academics/route-params";
import {markNoticeRead,openNotice} from "@/server/comms/notifications";
import {api,data,readJson} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const GET=api(async(request,context,route:AcademicIdRoute)=>
  data(await openNotice(await requireActor(request,context),await academicId(route))));
export const PATCH=api(async(request,context,route:AcademicIdRoute)=>{
  const actor=await requireActor(request,context),id=await academicId(route);
  await readJson(request,noticeRead,1024);
  return data(await markNoticeRead(actor,id));
});
