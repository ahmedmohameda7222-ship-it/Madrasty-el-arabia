import {cashbookInput,cashbookQuery} from "@/features/finance/cashbook-schema";
import {readCashbook,postCashbook} from "@/server/finance/cashbook";
import {academicQuery} from "@/server/academics/route-params";
import {api,data,readJson} from "@/server/http";
import {requireActor} from "@/server/identity/actor";
export const GET=api(async(request,context)=>data(await readCashbook(await requireActor(request,context),academicQuery(request,cashbookQuery).month)));
export const POST=api(async(request,context)=>data(await postCashbook(await requireActor(request,context),request.headers.get("idempotency-key"),await readJson(request,cashbookInput)),201));
