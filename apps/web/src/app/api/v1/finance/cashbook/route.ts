import {cashbookQuery,cashMovementInput} from "@madrasty/contracts";
import {academicQuery} from "@/server/academics/route-params";
import {readCashbook,postCashMovement} from "@/server/finance/cashbook";
import {api,data,readJson} from "@/server/http";
import {requireActor} from "@/server/identity/actor";
export const GET=api(async(request,context)=>data(await readCashbook(await requireActor(request,context),academicQuery(request,cashbookQuery).month)));
export const POST=api(async(request,context)=>data(await postCashMovement(await requireActor(request,context),request.headers.get("idempotency-key"),await readJson(request,cashMovementInput,4096)),201));
