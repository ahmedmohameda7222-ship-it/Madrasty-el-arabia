import "server-only";
import webPush from "web-push";
import {webPushSubscription} from "@madrasty/contracts";
import {browserPushEndpoint} from "../push";
import {providerDelay,type TransportResult} from "./result";

export type PushEnvelope={noticeId:string;deviceGuard:string;locale:"ar"|"de";title:string;body:string};
export function webPushConfigured(){
  return Boolean(process.env.WEB_PUSH_SUBJECT&&process.env.WEB_PUSH_PUBLIC_KEY&&process.env.WEB_PUSH_PRIVATE_KEY);
}
export async function sendWebPush(credentials:unknown,envelope:PushEnvelope):Promise<TransportResult>{
  const subject=process.env.WEB_PUSH_SUBJECT,publicKey=process.env.WEB_PUSH_PUBLIC_KEY,privateKey=process.env.WEB_PUSH_PRIVATE_KEY;
  if(!subject||!publicKey||!privateKey)return {state:"failed",failure:"provider_config",retryable:true};
  const subscription=webPushSubscription.safeParse(credentials);
  if(!subscription.success)return {state:"failed",failure:"provider_rejected",invalidInstallation:true};
  let endpoint:string;
  try{endpoint=browserPushEndpoint(subscription.data.endpoint);}
  catch{return {state:"failed",failure:"provider_rejected",invalidInstallation:true};}
  try{
    await webPush.sendNotification({endpoint,keys:subscription.data.keys},JSON.stringify(envelope),{
      vapidDetails:{subject,publicKey,privateKey},timeout:10000,TTL:86400,contentEncoding:"aes128gcm",
      topic:envelope.noticeId.replaceAll("-",""),
    });
    return {state:"accepted"};
  }catch(problem){
    if(problem instanceof webPush.WebPushError){
      const status=problem.statusCode;
      if(status===404||status===410)return {state:"failed",failure:"provider_rejected",invalidInstallation:true};
      if(status===429)return {state:"retry",failure:"provider_throttled",after:providerDelay(String(problem.headers["retry-after"]??""))};
      if(status===401||status===403)return {state:"failed",failure:"provider_config",retryable:true};
      if(status>=500)return {state:"uncertain",failure:"confirmation_lost"};
      return {state:"failed",failure:"provider_rejected"};
    }
    return {state:"uncertain",failure:"confirmation_lost"};
  }
}
