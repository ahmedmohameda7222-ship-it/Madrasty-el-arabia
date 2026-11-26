import { createFamilyInput, familyGroupQuery } from "@madrasty/contracts";
import { ApiError, api, data, readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { createFamily, listFamilyGroups } from "@/server/school/families";

export const POST = api(async (request, ctx) => {
  const actor = await requireActor(request, ctx);
  const result = await createFamily(actor, request.headers.get("idempotency-key"), await readJson(request, createFamilyInput));
  return data(result.data, result.replayed ? 200 : 201);
});

export const GET=api(async(request,ctx)=>{const actor=await requireActor(request,ctx);const query=familyGroupQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!query.success)throw new ApiError("validation");const result=await listFamilyGroups(actor,query.data);return data(result.rows,200,result.nextCursor?{nextCursor:result.nextCursor}:undefined);});
