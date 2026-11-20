import {bankProposal} from "@madrasty/contracts";
import {previewBank} from "@/server/finance/bank";
import {api,data,readJson} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const POST=api(async(request,context)=>{
  const actor=await requireActor(request,context);
  return data(await previewBank(actor,await readJson(request,bankProposal,4096)));
});
