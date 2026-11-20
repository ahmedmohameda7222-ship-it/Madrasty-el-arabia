import "server-only";
import {z} from "zod";
import {Webhook} from "svix";
import {ApiError} from "@/server/http";
import {providerDelay,type TransportResult} from "./result";

export type MailEnvelope={to:string;subject:string;text:string};
const sent=z.object({id:z.uuid()});
const message=z.object({
  type:z.string(),
  created_at:z.iso.datetime({offset:true}),
  data:z.object({
    email_id:z.uuid(),
    tags:z.record(z.string(),z.string()).optional(),
  }).passthrough(),
});
const eventState={
  "email.sent":"accepted",
  "email.delivered":"delivered",
  "email.bounced":"bounced",
  "email.complained":"bounced",
} as const;

export function emailProviderConfigured(){
  return Boolean(process.env.RESEND_API_KEY&&process.env.RESEND_FROM);
}

export async function sendEmail(jobId:string,envelope:MailEnvelope,key:string):Promise<TransportResult>{
  const apiKey=process.env.RESEND_API_KEY,from=process.env.RESEND_FROM;
  if(!apiKey||!from)return {state:"failed",failure:"provider_config",retryable:true};
  try{
    const reply=await fetch("https://api.resend.com/emails",{
      method:"POST",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(12000),
      headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json","Idempotency-Key":key},
      body:JSON.stringify({from,to:[envelope.to],subject:envelope.subject,text:envelope.text,tags:[{name:"delivery_id",value:jobId}]}),
    });
    if(reply.ok){
      const response=sent.safeParse(await reply.json());
      return response.success?{state:"accepted",providerId:response.data.id}:{state:"uncertain",failure:"confirmation_lost"};
    }
    await reply.body?.cancel().catch(()=>undefined);
    if(reply.status===429)return {state:"retry",failure:"provider_throttled",after:providerDelay(reply.headers.get("retry-after"))};
    if(reply.status===401||reply.status===403)return {state:"failed",failure:"provider_config",retryable:true};
    if(reply.status===409||reply.status>=500)return {state:"uncertain",failure:"confirmation_lost"};
    return {state:"failed",failure:"provider_rejected"};
  }catch{return {state:"uncertain",failure:"confirmation_lost"};}
}

export async function verifyEmailEvent(request:Request){
  const secret=process.env.RESEND_WEBHOOK_SECRET;
  if(!secret)throw new ApiError("unavailable");
  const key=request.headers.get("svix-id"),timestamp=request.headers.get("svix-timestamp"),signature=request.headers.get("svix-signature");
  if(!key||key.length>160||!timestamp||!signature||signature.length>8192)throw new ApiError("unauthenticated");
  const reader=request.body?.getReader();
  if(!reader)throw new ApiError("bad_request");
  const decoder=new TextDecoder("utf-8",{fatal:true});
  let body="",length=0;
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      length+=value.byteLength;
      if(length>65536){
        await reader.cancel().catch(()=>undefined);
        throw new ApiError("payload_too_large");
      }
      body+=decoder.decode(value,{stream:true});
    }
    body+=decoder.decode();
  }catch(error){throw error instanceof ApiError?error:new ApiError("bad_request");}
  finally{reader.releaseLock();}
  let verified:unknown;
  try{verified=new Webhook(secret).verify(body,{"svix-id":key,"svix-timestamp":timestamp,"svix-signature":signature});}
  catch{throw new ApiError("unauthenticated");}
  const parsed=message.safeParse(verified);
  if(!parsed.success||!Object.hasOwn(eventState,parsed.data.type))return null;
  const hinted=z.uuid().safeParse(parsed.data.data.tags?.delivery_id);
  return {key,providerId:parsed.data.data.email_id,hintedJob:hinted.success?hinted.data:null,
    state:eventState[parsed.data.type as keyof typeof eventState],occurredAt:parsed.data.created_at};
}
