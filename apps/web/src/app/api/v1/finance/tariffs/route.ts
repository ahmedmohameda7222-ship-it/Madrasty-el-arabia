import {feeTariffInput,tariffQuery} from "@madrasty/contracts";
import {academicQuery} from "@/server/academics/route-params";
import {readTariffs,saveTariff} from "@/server/finance/feeSettings";
import {api,data,readJson} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const GET=api(async(request,context)=>{
  const page=await readTariffs(await requireActor(request,context),academicQuery(request,tariffQuery));
  return data(page.items,200,{nextCursor:page.nextCursor});
});
export const POST=api(async(request,context)=>{
  const actor=await requireActor(request,context);
  return data(await saveTariff(actor,request.headers.get("idempotency-key"),await readJson(request,feeTariffInput)),201);
});
