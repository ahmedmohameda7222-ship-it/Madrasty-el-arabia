import {bankChallengeInput,bankVerification} from "@madrasty/contracts";
import {NextResponse} from "next/server";
import type {Session} from "@supabase/supabase-js";
import {beginBankChallenge,finishBankChallenge} from "@/server/finance/bank";
import {api,data,readJson} from "@/server/http";
import {requireActor} from "@/server/identity/actor";
import {attachWebSession,requestCookie,requestCredential} from "@/server/identity/session";

export const POST=api(async(request,context)=>{
  const actor=await requireActor(request,context),credential=requestCredential(request);
  return data(await beginBankChallenge(actor,credential.token,await readJson(request,bankChallengeInput,4096)),201);
});
export const PATCH=api(async(request,context)=>{
  const actor=await requireActor(request,context),credential=requestCredential(request);
  const {receipt,provider}=await finishBankChallenge(actor,credential.token,await readJson(request,bankVerification,1024));
  if(credential.kind==="bearer")return data({...receipt,providerSession:provider});
  return attachWebSession(NextResponse.json({data:receipt}),provider as Session,requestCookie(request,"csrf"));
});
