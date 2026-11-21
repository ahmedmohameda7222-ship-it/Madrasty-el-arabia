import {fileMessageReport,messageReportQuery} from "@madrasty/contracts";
import {academicQuery} from "@/server/academics/route-params";
import {listMessageReports,reportMessage} from "@/server/comms/moderation";
import {api,data,readJson} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const GET=api(async(request,context)=>{
  const list=await listMessageReports(await requireActor(request,context),academicQuery(request,messageReportQuery));
  return data(list.items,200,{nextCursor:list.nextCursor});
});
export const POST=api(async(request,context)=>{
  const actor=await requireActor(request,context);
  return data(await reportMessage(actor,request.headers.get("idempotency-key"),await readJson(request,fileMessageReport,4096)),201);
});
