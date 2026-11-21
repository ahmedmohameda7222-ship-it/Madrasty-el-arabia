import "server-only";
import {ECDH} from "node:crypto";
import {pushOptions,pushReceipt,type pushInstallation,type pushRegistration} from "@madrasty/contracts";
import type {z} from "zod";
import {withActor,type ActorContext} from "@/server/db/scoped";
import {ApiError} from "@/server/http";

export function browserPushEndpoint(raw:string){
  const endpoint=new URL(raw);
  if(endpoint.protocol!=="https:"||endpoint.username||endpoint.password||endpoint.port||endpoint.hash)
    throw new ApiError("validation");
  const host=endpoint.hostname;
  const path=endpoint.pathname;
  const google=host==="fcm.googleapis.com"&&(/^\/fcm\/send\/[^/]+$/.test(path)||/^\/wp\/[^/]+$/.test(path));
  const firefox=host==="updates.push.services.mozilla.com"&&path.startsWith("/wpush/");
  const safari=host.endsWith(".push.apple.com")&&path.length>1;
  const edge=host.endsWith(".notify.windows.com")&&path.length>1;
  if(!google&&!firefox&&!safari&&!edge)throw new ApiError("validation");
  return endpoint.toString();
}

export function schoolPushOptions(){
  const web=pushOptions.shape.web.safeParse(process.env.WEB_PUSH_PUBLIC_KEY?{publicKey:process.env.WEB_PUSH_PUBLIC_KEY}:null);
  const android=pushOptions.shape.android.safeParse({
    apiKey:process.env.FCM_ANDROID_API_KEY,projectId:process.env.FCM_ANDROID_PROJECT_ID,
    senderId:process.env.FCM_ANDROID_SENDER_ID,firebaseAppId:process.env.FCM_ANDROID_APP_ID,
  });
  const firebase=android.success?android.data:null;
  return {web:web.success?web.data:null,android:firebase&&firebase.firebaseAppId.split(":")[1]===firebase.senderId?firebase:null};
}
type Installation=z.infer<typeof pushInstallation>;
export function pushInstallationStatus(actor:ActorContext,input:Installation){
  return withActor(actor,async(tx)=>{
    const [row]=await tx<{enabled:boolean}[]>`select app.push_installation_enabled(${input.installationId},${input.platform}) as enabled`;
    return row;
  });
}
export function disableInstallation(actor:ActorContext,input:Installation){
  return withActor(actor,async(tx)=>{
    await tx`select app.revoke_push_installation(${input.installationId},${input.platform})`;
    return {enabled:false};
  });
}

export function enableInstallation(actor:ActorContext,input:z.infer<typeof pushRegistration>){
  if(input.sessionId!==actor.sessionId)throw new ApiError("forbidden");
  const configured=schoolPushOptions();
  if(!configured[input.platform])throw new ApiError("unavailable");
  const endpoint=input.platform==="web"?browserPushEndpoint(input.subscription.endpoint):input.token;
  if(input.platform==="web"){
    const key=Buffer.from(input.subscription.keys.p256dh,"base64url");
    const auth=Buffer.from(input.subscription.keys.auth,"base64url");
    try{
      if(key[0]!==4||key.length!==65||auth.length!==16||key.toString("base64url")!==input.subscription.keys.p256dh||
        auth.toString("base64url")!==input.subscription.keys.auth)throw new Error("subscription encoding");
      ECDH.convertKey(key,"prime256v1");
    }catch{throw new ApiError("validation");}
    if(input.subscription.expirationTime!==null&&input.subscription.expirationTime<=Date.now())throw new ApiError("validation");
  }
  const credentials=input.platform==="web"?{...input.subscription,endpoint}:{token:input.token};
  return withActor(actor,async(tx)=>{
    const [row]=await tx<{guard:string}[]>`
      select app.bind_push_installation(${input.installationId},${input.platform},${endpoint},${tx.json(credentials)}) as guard`;
    return pushReceipt.parse({installationId:input.installationId,guard:row.guard});
  });
}
