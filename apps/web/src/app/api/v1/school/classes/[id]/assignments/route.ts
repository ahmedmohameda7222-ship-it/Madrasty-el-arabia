import { assignmentInput } from "@madrasty/contracts";
import { z } from "zod";
import { ApiError, api, data, readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { createAssignment, listAssignments } from "@/server/school/assignments";

type Route={params:Promise<{id:string}>};
async function getId(route: Route){
  const id=z.uuid().safeParse((await route.params).id);
  if(!id.success) throw new ApiError("not_found");
  return id.data;
}

export const GET=api(async(request,ctx,route:Route)=>data(await listAssignments(await requireActor(request,ctx),await getId(route))));

export const POST=api(async(request,ctx,route:Route)=>{
  const actor=await requireActor(request,ctx);
  const result=await createAssignment(actor,await getId(route),request.headers.get("idempotency-key"),await readJson(request,assignmentInput));
  return data(result.data,result.replayed?200:201);
});
