import { staffInput, staffListInput } from "@madrasty/contracts";
import { ApiError, api, data, readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { createStaff, listStaff } from "@/server/school/assignments";

export const GET=api(async(request,ctx)=>{
  const actor=await requireActor(request,ctx);
  const query=staffListInput.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if(!query.success) throw new ApiError("validation");
  const found=await listStaff(actor,query.data);
  return data(found.rows,200,found.nextCursor?{nextCursor:found.nextCursor}:undefined);
});

export const POST=api(async(request,ctx)=>{
  const actor=await requireActor(request,ctx);
  const result=await createStaff(actor,request.headers.get("idempotency-key"),await readJson(request,staffInput));
  return data(result.data,result.replayed?200:201);
});
