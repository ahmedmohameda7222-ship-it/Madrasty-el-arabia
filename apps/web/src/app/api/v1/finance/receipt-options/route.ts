import {loadReceiptOptions} from "@/server/finance/receipts";
import {api,data} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const GET=api(async(request,context)=>data(await loadReceiptOptions(await requireActor(request,context))));
