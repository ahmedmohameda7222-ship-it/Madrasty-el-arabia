import {pushInstallation,pushRegistration} from "@madrasty/contracts";
import {academicQuery} from "@/server/academics/route-params";
import {disableInstallation,enableInstallation,pushInstallationStatus,schoolPushOptions} from "@/server/comms/push";
import {api,data,readJson} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const GET=api(async(request,context)=>{
  const actor=await requireActor(request,context),params=new URL(request.url).searchParams;
  return data(params.size===0?schoolPushOptions():await pushInstallationStatus(actor,academicQuery(request,pushInstallation)));
});
export const PUT=api(async(request,context)=>{
  const actor=await requireActor(request,context);
  return data(await enableInstallation(actor,await readJson(request,pushRegistration,8192)));
});
export const DELETE=api(async(request,context)=>{
  const actor=await requireActor(request,context);
  return data(await disableInstallation(actor,await readJson(request,pushInstallation,1024)));
});
