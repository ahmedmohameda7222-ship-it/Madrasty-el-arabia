import {automaticBillingInput} from "@madrasty/contracts";
import {readAutomaticBilling,saveAutomaticBilling} from "@/server/finance/automaticBilling";
import {api,data,readJson} from "@/server/http";
import {requireActor} from "@/server/identity/actor";
export const GET=api(async(request,context)=>data(await readAutomaticBilling(await requireActor(request,context))));
export const PUT=api(async(request,context)=>data(await saveAutomaticBilling(await requireActor(request,context),request.headers.get("idempotency-key"),await readJson(request,automaticBillingInput,2048))));
