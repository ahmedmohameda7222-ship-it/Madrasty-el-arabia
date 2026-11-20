"use client";

import {z} from "zod";
import {pushOptions,pushReceipt,pushStatus} from "@madrasty/contracts";
import {webHeaders} from "@/api/client-headers";
import {ApiResponseError,requestApi} from "@/api/client";
import type {AccountPartition} from "@/ui/AccountScope";

const installationKey="madrasty.push.installation";
const storageKey="madrasty.push.binding";
const marker=z.object({owner:z.string(),guard:z.uuid(),confirmed:z.number()});
const path="/me/push-subscriptions" as const;

let bindingEpoch=0;

function installation(){
  const existing=z.uuid().safeParse(localStorage.getItem(installationKey));
  if(existing.success)return existing.data;
  const id=crypto.randomUUID();
  localStorage.setItem(installationKey,id);
  return id;
}
async function owner(actor:AccountPartition){
  const hashed=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify([
    actor.accountId,actor.sessionId,actor.persona,
  ])));
  return Array.from(new Uint8Array(hashed),(part)=>part.toString(16).padStart(2,"0")).join("");
}
function readMarker(){
  try{const state=marker.safeParse(JSON.parse(localStorage.getItem(storageKey)??"null"));return state.success?state.data:null;}
  catch{return null;}
}

// The root service worker reads the same device store before displaying a queued push.
function writeDeliveryGuard(guard:string|null){
  return new Promise<void>((resolve,reject)=>{
    const opening=indexedDB.open("madrasty-push",1);
    opening.onupgradeneeded=()=>{opening.result.createObjectStore("device");};
    opening.onerror=()=>reject(opening.error);
    opening.onblocked=()=>reject(new Error("Push storage is unavailable"));
    opening.onsuccess=()=>{
      const database=opening.result;
      const tx=database.transaction("device","readwrite");
      const devices=tx.objectStore("device");
      if(guard)devices.put(guard,"deliveryGuard");else devices.delete("deliveryGuard");
      tx.oncomplete=()=>{database.close();resolve();};
      tx.onerror=tx.onabort=()=>{database.close();reject(tx.error);};
    };
  });
}

function registration(){
  return navigator.serviceWorker?.getRegistration("/").then((found)=>found?.active?found:undefined);
}
export function standaloneOnIPhone(){
  const ios=/iPhone|iPad|iPod/i.test(navigator.userAgent)||navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1;
  return !ios||window.matchMedia("(display-mode: standalone)").matches||(navigator as Navigator&{standalone?:boolean}).standalone===true;
}
export function browserPushSupported(){
  return "Notification" in window&&"PushManager" in window&&"serviceWorker" in navigator&&
    typeof crypto.subtle!=="undefined"&&"indexedDB" in window;
}

function decodePublicKey(base64:string){
  const padded=(base64+"=".repeat((4-base64.length%4)%4)).replace(/-/g,"+").replace(/_/g,"/");
  return Uint8Array.from(atob(padded),(symbol)=>symbol.charCodeAt(0));
}

async function bind(actor:AccountPartition,subscription:PushSubscription,signal?:AbortSignal){
  const epoch=bindingEpoch,identity=await owner(actor),installationId=installation();
  const keys=subscription.toJSON().keys;
  if(!keys?.p256dh||!keys.auth)throw new Error("Subscription keys missing");
  const {data}=await requestApi(path,pushReceipt,{
    method:"PUT",headers:webHeaders(actor.persona),signal,
    body:JSON.stringify({installationId,sessionId:actor.sessionId,platform:"web",subscription:{
      endpoint:subscription.endpoint,expirationTime:subscription.expirationTime,keys,
    }}),
  });
  if(signal?.aborted)throw signal.reason;
  if(epoch!==bindingEpoch)throw new Error("Push account changed");
  await writeDeliveryGuard(data.guard);
  localStorage.setItem(storageKey,JSON.stringify({owner:identity,guard:data.guard,confirmed:Date.now()}));
}
export async function prepareBrowserPush(actor:AccountPartition,signal:AbortSignal){
  if(!browserPushSupported()||!standaloneOnIPhone())return null;
  const [{data},service]=await Promise.all([
    requestApi(path,pushOptions,{headers:{"X-School-Persona":actor.persona},signal}),
    navigator.serviceWorker.register("/school-sw.js").then(()=>navigator.serviceWorker.ready),
  ]);
  if(signal.aborted||!service.active||!data.web)return null;
  const applicationServerKey=decodePublicKey(data.web.publicKey);
  const previous=await service.pushManager.getSubscription();
  if(previous?.options.applicationServerKey){
    const oldKey=new Uint8Array(previous.options.applicationServerKey);
    if(oldKey.length!==applicationServerKey.length||oldKey.some((byte,index)=>byte!==applicationServerKey[index])){
      await previous.unsubscribe();
    }
  }
  return {service,applicationServerKey};
}
export async function activateBrowserPush(actor:AccountPartition,option:NonNullable<Awaited<ReturnType<typeof prepareBrowserPush>>>){
  if(Notification.permission==="denied")return "denied" as const;
  try{
    const subscription=await option.service.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:option.applicationServerKey});
    await bind(actor,subscription);
    return "enabled" as const;
  }catch(error){
    if(error instanceof DOMException&&error.name==="NotAllowedError")return "denied" as const;
    throw error;
  }
}

export async function reconcileBrowserPush(actor:AccountPartition,signal?:AbortSignal){
  const current=readMarker();
  if(!current)return false;
  if(!browserPushSupported()||current.owner!==await owner(actor)){
    if(!signal?.aborted)await detachBrowserPush(false);
    return false;
  }
  const service=await registration();
  const subscription=await service?.pushManager.getSubscription();
  if(!subscription||Notification.permission!=="granted"){
    if(!signal?.aborted)await disableBrowserPush(actor);
    return false;
  }
  try{
    const {data}=await requestApi(`${path}?platform=web&installationId=${installation()}`,pushStatus,
      {headers:{"X-School-Persona":actor.persona},signal});
    if(signal?.aborted)return false;
    if(!data.enabled){await detachBrowserPush(false);return false;}
    if(Date.now()-current.confirmed>=86400000)await bind(actor,subscription,signal);
    return true;
  }catch(error){
    if(signal?.aborted)return false;
    if(error instanceof ApiResponseError&&[401,403].includes(error.status))await detachBrowserPush(false);
    throw error;
  }
}

export async function detachBrowserPush(unsubscribe=true){
  bindingEpoch++;
  try{localStorage.removeItem(storageKey);}catch{ /* local provider storage is optional */ }
  const badge=navigator as Navigator&{clearAppBadge?:()=>Promise<void>};
  void badge.clearAppBadge?.().catch(()=>undefined);
  await writeDeliveryGuard(null).catch(()=>undefined);
  if(unsubscribe){
    const service=await registration();
    const subscription=await service?.pushManager.getSubscription();
    await subscription?.unsubscribe().catch(()=>undefined);
  }
}
export async function disableBrowserPush(actor:AccountPartition){
  const payload={installationId:installation(),platform:"web"};
  await Promise.all([
    detachBrowserPush(),
    requestApi(path,pushStatus,{method:"DELETE",headers:webHeaders(actor.persona),body:JSON.stringify(payload)}),
  ]);
}
