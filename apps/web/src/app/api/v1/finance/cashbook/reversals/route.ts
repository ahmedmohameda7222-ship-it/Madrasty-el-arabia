import {cashMovementReversalInput} from "@madrasty/contracts";
import {reverseCashMovement} from "@/server/finance/cashbook";
import {api,data,readJson} from "@/server/http";
import {requireActor} from "@/server/identity/actor";
export const POST=api(async(request,context)=>data(await reverseCashMovement(await requireActor(request,context),request.headers.get("idempotency-key"),await readJson(request,cashMovementReversalInput,4096)),201));
