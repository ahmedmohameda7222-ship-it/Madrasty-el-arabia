import "server-only";
import {createHash,createHmac,timingSafeEqual} from "node:crypto";
import {z} from "zod";
import {ApiError} from "@/server/http";
import {allowAuthMail} from "@/server/identity/authMail";
import type {MailEnvelope} from "./email";
import {providerDelay,type TransportResult} from "./result";

const submitted=z.object({messageIds:z.tuple([z.string()])});
const submissionError=z.object({code:z.string()});
const callback=z.object({
  event:z.string(),email:z.email(),"message-id":z.string(),ts_event:z.int(),
  "X-Mailin-custom":z.string().max(160).optional(),
});
const callbackStates={
  request:"accepted",sent:"accepted",delivered:"delivered",hard_bounce:"bounced",
  spam:"bounced",blocked:"bounced",invalid_email:"bounced",
} as const;
const maxEventAgeSeconds=24*60*60;

function providerId(value:string){
  const id=value.trim().replace(/^<(.*)>$/, "$1");
  return /^[\x21-\x7e]{1,154}$/.test(id)?`brevo:${id}`:null;
}

function equal(left:string,right:string){
  const a=Buffer.from(left),b=Buffer.from(right);
  return a.length===b.length&&timingSafeEqual(a,b);
}

function signDelivery(secret:string,jobId:string,recipient:string){
  return createHmac("sha256",secret).update(`delivery:${jobId}:${recipient.trim().toLowerCase()}`).digest("hex");
}

function escapeHtml(text:string){
  return text.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
}

function renderHtml(text:string){
  const origin=process.env.APP_ORIGIN;
  const lines=text.split("\n").map((line)=>{
    const escaped=escapeHtml(line);
    return origin&&line.startsWith(`${origin}/`)&&/^\S+$/.test(line)
      ?`<a href="${escaped}">${escaped}</a>`:escaped;
  });
  return `<div dir="auto">${lines.join("<br>")}</div>`;
}

export function brevoConfigured(){
  return Boolean(process.env.BREVO_API_KEY&&process.env.BREVO_FROM&&process.env.BREVO_WEBHOOK_SECRET);
}

export async function sendBrevoEmail(jobId:string,envelope:MailEnvelope):Promise<TransportResult>{
  const apiKey=process.env.BREVO_API_KEY,from=process.env.BREVO_FROM,secret=process.env.BREVO_WEBHOOK_SECRET;
  if(!apiKey||!from||!secret)return {state:"failed",failure:"provider_config",retryable:true};
  try{
    const reply=await fetch("https://api.brevo.com/v3/smtp/email",{
      method:"POST",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(12000),
      headers:{"api-key":apiKey,"Content-Type":"application/json",Accept:"application/json"},
      body:JSON.stringify({
        sender:{email:from,name:"Madrasty El Arabia"},subject:envelope.subject,textContent:envelope.text,
        htmlContent:renderHtml(envelope.text),
        messageVersions:[{to:[{email:envelope.to}]}],
        headers:{idempotencyKey:jobId,"X-Mailin-custom":`delivery_id:${jobId}.${signDelivery(secret,jobId,envelope.to)}`},
      }),
    });
    if(reply.ok){
      const parsed=submitted.safeParse(await reply.json());
      const id=parsed.success?providerId(parsed.data.messageIds[0]):null;
      return id?{state:"accepted",providerId:id}:{state:"uncertain",failure:"confirmation_lost"};
    }
    if(reply.status===429)return {state:"retry",failure:"provider_throttled",after:providerDelay(reply.headers.get("retry-after"))};
    if(reply.status===401||reply.status===403)return {state:"failed",failure:"provider_config",retryable:true};
    if(reply.status===409||reply.status>=500)return {state:"uncertain",failure:"confirmation_lost"};
    const failure=submissionError.safeParse(await reply.json().catch(()=>null));
    if(failure.success&&failure.data.code==="duplicate_parameter")return {state:"uncertain",failure:"confirmation_lost"};
    return {state:"failed",failure:"provider_rejected"};
  }catch{return {state:"uncertain",failure:"confirmation_lost"};}
}

export async function verifyBrevoEmailEvent(request:Request,readBody:()=>Promise<string>){
  const secret=process.env.BREVO_WEBHOOK_SECRET;
  if(!secret)throw new ApiError("unavailable");
  if(!equal(request.headers.get("authorization")??"",`Bearer ${secret}`))throw new ApiError("unauthenticated");
  const raw=await readBody();
  let payload:unknown;
  try{payload=JSON.parse(raw);}catch{throw new ApiError("bad_request");}
  const parsed=callback.safeParse(payload);
  if(!parsed.success)return null;
  const event=parsed.data;
  if(!Object.hasOwn(callbackStates,event.event)||!allowAuthMail(event.email))return null;
  const marker=event["X-Mailin-custom"]?.match(/^delivery_id:([a-f0-9-]{36})\.([a-f0-9]{64})$/);
  const job=z.uuid().safeParse(marker?.[1]);
  if(!marker||!job.success||!equal(marker[2],signDelivery(secret,job.data,event.email)))return null;
  const id=providerId(event["message-id"]);
  const now=Math.floor(Date.now()/1000);
  if(!id||event.ts_event<now-maxEventAgeSeconds||event.ts_event>now+300)return null;
  const key=createHash("sha256").update(`${id}:${event.event}:${event.ts_event}`).digest("hex");
  return {key:`brevo:${key}`,providerId:id,hintedJob:job.data,
    state:callbackStates[event.event as keyof typeof callbackStates],occurredAt:new Date(event.ts_event*1000).toISOString()};
}
