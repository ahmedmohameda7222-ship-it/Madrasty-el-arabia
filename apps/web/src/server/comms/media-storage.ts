import "server-only";
import { createClient } from "@supabase/supabase-js";
import { ApiError } from "@/server/http";

export type MediaKind="photo"|"voice";
const stageBuckets={photo:"madrasty-chat-photo-staging",voice:"madrasty-chat-voice-staging"} as const;
export const mediaMimeType={photo:"image/jpeg",voice:"audio/wav"} as const;
const safeId=/^[0-9a-f-]{36}$/i;
const readyBucket="madrasty-chat-media";
function configuration(){
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_MEDIA_ADMIN_KEY;
  if(!url||!key)throw new ApiError("unavailable");
  return {origin:new URL(url).origin,key};
}
function client(){
  const {origin,key}=configuration();
  return createClient(origin,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}
function objectName(kind:MediaKind,id:string){
  if(!safeId.test(id))throw new ApiError("not_found");
  return `${id}.${kind==="photo"?"jpeg":"wav"}`;
}
export async function signMediaUpload(kind:MediaKind,id:string){
  const {data,error}=await client().storage.from(stageBuckets[kind]).createSignedUploadUrl(objectName(kind,id),{upsert:false});
  if(error||!data)throw new ApiError("unavailable");
  const url=new URL(data.signedUrl);
  if(url.origin!==configuration().origin||url.protocol!=="https:")throw new ApiError("unavailable");
  return url.toString();
}
export async function storageMedia(kind:MediaKind,id:string,stage:boolean,range?:string){
  const {origin,key}=configuration();
  const bucket=stage?stageBuckets[kind]:readyBucket;
  const location=`${origin}/storage/v1/object/authenticated/${bucket}/${objectName(kind,id)}`;
  try{return await fetch(location,{
    redirect:"error",cache:"no-store",signal:AbortSignal.timeout(20000),
    headers:{apikey:key,Authorization:`Bearer ${key}`,"Accept-Encoding":"identity",...(range?{Range:range}:{})},
  });}catch{throw new ApiError("unavailable");}
}
export async function saveReadyMedia(kind:MediaKind,id:string,buffer:Buffer){
  const {error}=await client().storage.from(readyBucket).upload(objectName(kind,id),buffer,{
    contentType:mediaMimeType[kind],cacheControl:"0",upsert:true,
  });
  if(error)throw new ApiError("unavailable");
}
export async function removeMedia(kind:MediaKind,id:string,raw:boolean){
  const {error}=await client().storage.from(raw?stageBuckets[kind]:readyBucket).remove([objectName(kind,id)]);
  return !error;
}
