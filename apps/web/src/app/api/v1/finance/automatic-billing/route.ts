import {autoBillingUpdate} from "@madrasty/contracts";
import {readAutoBilling,updateAutoBilling} from "@/server/finance/automaticBilling";
import {api,data,readJson} from "@/server/http";
import {requireActor} from "@/server/identity/actor";
export const GET=api(async(request,context)=>data(await readAutoBilling(await requireActor(request,context))));
export const PUT=api(async(request,context)=>data(await updateAutoBilling(await requireActor(request,context),request.headers.get("idempotency-key"),await readJson(request,autoBillingUpdate,4096))));
