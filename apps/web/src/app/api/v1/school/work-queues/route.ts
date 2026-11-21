import { queueFilterSchema } from "@madrasty/contracts";
import { ApiError, api, data } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { readWorkQueues } from "@/server/school/work-queues";

export const GET=api(async(request,context)=>{
  const actor=await requireActor(request,context);
  const filter=queueFilterSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if(!filter.success)throw new ApiError("validation");
  return data(await readWorkQueues(actor,filter.data.asOf));
});
