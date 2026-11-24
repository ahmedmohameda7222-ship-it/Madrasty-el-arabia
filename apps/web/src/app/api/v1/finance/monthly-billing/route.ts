import {monthlyBillingInput} from "@/features/finance/monthly-billing-schema";
import {readMonthlyBilling,configureMonthlyBilling} from "@/server/finance/monthly-billing";
import {api,data,readJson} from "@/server/http";
import {requireActor} from "@/server/identity/actor";
export const GET=api(async(request,context)=>data(await readMonthlyBilling(await requireActor(request,context))));
export const PUT=api(async(request,context)=>data(await configureMonthlyBilling(await requireActor(request,context),request.headers.get("idempotency-key"),await readJson(request,monthlyBillingInput))));
