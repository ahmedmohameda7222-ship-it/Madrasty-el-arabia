import { queueListQuery, workQueueKeySchema } from "@madrasty/contracts";
import { ApiError, api, data } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { readWorkQueue } from "@/server/school/work-queues";

type Route={params:Promise<{key:string}>};
export const GET=api(async(request,context,route:Route)=>{
  const actor=await requireActor(request,context);
  const key=workQueueKeySchema.safeParse((await route.params).key);
  if(!key.success)throw new ApiError("not_found");
  const filters=queueListQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if(!filters.success)throw new ApiError("validation");
  const result=await readWorkQueue(actor,key.data,filters.data);
  return data(result.page,200,result.nextCursor?{nextCursor:result.nextCursor}:undefined);
});
