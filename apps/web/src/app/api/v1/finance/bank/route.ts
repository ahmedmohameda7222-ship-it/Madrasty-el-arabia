import {bankUpdate} from "@madrasty/contracts";
import {changeBank,readBank} from "@/server/finance/bank";
import {api,data,readJson} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const GET=api(async(request,context)=>data(await readBank(await requireActor(request,context))));
export const PUT=api(async(request,context)=>{
  const actor=await requireActor(request,context),input=await readJson(request,bankUpdate,4096);
  return data(await changeBank(actor,request.headers.get("idempotency-key"),input));
});
