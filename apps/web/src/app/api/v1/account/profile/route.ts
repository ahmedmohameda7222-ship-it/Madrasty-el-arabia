import { accountProfilePatch } from "@madrasty/contracts";
import { api,data,readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { readProfile,saveProfile } from "@/server/identity/profile";

export const GET=api(async(request,context)=>data(await readProfile(await requireActor(request,context))));
export const PATCH=api(async(request,context)=>{
  const actor=await requireActor(request,context);
  const input=await readJson(request,accountProfilePatch);
  return data((await saveProfile(actor,request.headers.get("idempotency-key"),input)).data);
});
