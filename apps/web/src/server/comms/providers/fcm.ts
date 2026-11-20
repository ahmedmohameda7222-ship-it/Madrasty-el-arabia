import "server-only";
import {JWT} from "google-auth-library";
import {z} from "zod";
import type {PushEnvelope} from "./webPush";
import {providerDelay,type TransportResult} from "./result";

const credentials=z.object({type:z.literal("service_account"),client_email:z.email(),private_key:z.string().startsWith("-----BEGIN PRIVATE KEY-----")});
const registration=z.object({token:z.string().min(30).max(4096).regex(/^[A-Za-z0-9_:\-]+$/)});
const message=z.object({name:z.string().max(180)});
const errors=z.object({error:z.object({details:z.array(z.object({errorCode:z.string().optional()}).passthrough()).optional()})});
let client:JWT|undefined;
export function fcmConfigured(){
  return Boolean(process.env.FCM_SERVICE_ACCOUNT_B64&&process.env.FCM_ANDROID_PROJECT_ID);
}
export async function sendAndroidPush(stored:unknown,envelope:PushEnvelope):Promise<TransportResult>{
  const project=process.env.FCM_ANDROID_PROJECT_ID,configuration=process.env.FCM_SERVICE_ACCOUNT_B64;
  if(!project||!configuration||!(/^[a-z][a-z0-9-]{4,62}$/).test(project))return {state:"failed",failure:"provider_config",retryable:true};
  const device=registration.safeParse(stored);
  if(!device.success)return {state:"failed",failure:"provider_rejected",invalidInstallation:true};
  let token:string|null|undefined;
  try{
    const account=credentials.parse(JSON.parse(Buffer.from(configuration,"base64").toString("utf8")));
    client??=new JWT({
      email:account.client_email,key:account.private_key,scopes:["https://www.googleapis.com/auth/firebase.messaging"],
      transporterOptions:{timeout:6500,retry:false},
    });
    token=(await client.getAccessToken()).token;
  }catch{return {state:"retry",failure:"provider_unavailable"};}
  if(!token)return {state:"retry",failure:"provider_unavailable"};
  try{
    const reply=await fetch(`https://fcm.googleapis.com/v1/projects/${project}/messages:send`,{
      method:"POST",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(10000),
      headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},
      body:JSON.stringify({message:{token:device.data.token,data:envelope,android:{ttl:"86400s",priority:"NORMAL"}}}),
    });
    if(reply.ok){
      const sent=message.safeParse(await reply.json());
      return sent.success?{state:"accepted",providerId:sent.data.name}:{state:"uncertain",failure:"confirmation_lost"};
    }
    if(reply.status===404){
      const error=errors.safeParse(await reply.json().catch(()=>undefined));
      return {state:"failed",failure:"provider_rejected",
        invalidInstallation:error.success&&!!error.data.error.details?.some((item)=>item.errorCode==="UNREGISTERED")};
    }
    await reply.body?.cancel().catch(()=>undefined);
    if(reply.status===429)return {state:"retry",failure:"provider_throttled",after:providerDelay(reply.headers.get("retry-after"))};
    if(reply.status===401||reply.status===403)return {state:"failed",failure:"provider_config",retryable:true};
    if(reply.status>=500)return {state:"uncertain",failure:"confirmation_lost"};
    return {state:"failed",failure:"provider_rejected"};
  }catch{return {state:"uncertain",failure:"confirmation_lost"};}
}
