import "server-only";
import { idempotencyKeySchema,mediaUploadGrant,mediaUploadState,photoLimit,voiceLimit,voiceMaxMilliseconds,type uploadMediaInput } from "@madrasty/contracts";
import type { z } from "zod";
import { withActor,withRuntime,type ActorContext } from "@/server/db/scoped";
import { ApiError } from "@/server/http";
import { mediaMimeType,removeMedia,saveReadyMedia,signMediaUpload,storageMedia,type MediaKind } from "./media-storage";
import { cleanPhoto,cleanVoice,readBoundedMedia } from "./media-validation";

type UploadState="staged"|"processing"|"ready"|"failed"|"cancelled";
type MediaObject={kind:MediaKind;bytes:number};
const uploadState=(state:UploadState,id:string)=>mediaUploadState.parse(state==="ready"?{state,mediaId:id}:{state});

export async function issueMediaUpload(actor:ActorContext,thread:string,key:string|null,input:z.infer<typeof uploadMediaInput>){
  const idempotency=idempotencyKeySchema.safeParse(key);
  if(!idempotency.success)throw new ApiError("invalid_idempotency_key");
  const entry=await withActor(actor,async(tx)=>{
    const [row]=await tx<{uploadId:string;expiresAt:string}[]>`
      select upload_id as "uploadId",to_char(valid_until at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "expiresAt"
      from app.issue_chat_upload(${thread},${idempotency.data},${input.mediaKind},${input.bytes})`;
    return row;
  });
  return mediaUploadGrant.parse({...entry,url:await signMediaUpload(input.mediaKind,entry.uploadId),
    maxBytes:input.mediaKind==="photo"?photoLimit:voiceLimit,maxDurationMs:input.mediaKind==="voice"?voiceMaxMilliseconds:null});
}

export async function updateMediaUpload(actor:ActorContext,thread:string,id:string,action:"finalize"|"cancel",key:string|null){
  if(action==="cancel")return withActor(actor,async(tx)=>{
    const [{state}]=await tx<{state:UploadState}[]>`select app.cancel_chat_upload(${thread},${id}) as state`;
    return uploadState(state,id);
  });

  const idempotency=idempotencyKeySchema.safeParse(key);
  if(!idempotency.success)throw new ApiError("invalid_idempotency_key");
  const claim=await withActor(actor,async(tx)=>{
    const [row]=await tx<{outcome:UploadState;kind:MediaKind;declared_bytes:number;lease:string|null}[]>
      `select * from app.claim_chat_upload(${thread},${id},${idempotency.data})`;
    return row;
  });
  if(!claim.lease)return uploadState(claim.outcome,id);
  const finish=(state:"staged"|"failed"|"ready",bytes:number|null=null,duration:number|null=null)=>
    withActor(actor,async(tx)=>{
      const [row]=await tx<{state:UploadState}[]>`
        select app.finish_chat_upload(${thread},${id},${claim.lease},${state},${bytes},${duration}) as state`;
      return uploadState(row.state,id);
    });

  let cleaned:{buffer:Buffer;duration:number|null};
  try{
    const response=await storageMedia(claim.kind,id,true);
    if(!response.ok){
      let missing=response.status===404||response.headers.get("x-error-code")==="NoSuchKey";
      if(response.status===400&&Number(response.headers.get("content-length"))>0&&Number(response.headers.get("content-length"))<=2048){
        const reason=await response.json().catch(()=>null) as {code?:string;error?:string;message?:string}|null;
        missing=reason?.code==="NoSuchKey"||reason?.error==="not_found"&&reason.message==="Object not found";
      }else await response.body?.cancel().catch(()=>undefined);
      if(missing)return finish("staged");
      throw new ApiError("unavailable");
    }
    const limit=claim.kind==="photo"?photoLimit:voiceLimit;
    const raw=await readBoundedMedia(response,claim.declared_bytes,limit);
    cleaned=claim.kind==="photo"?await cleanPhoto(raw):cleanVoice(raw);
    await saveReadyMedia(claim.kind,id,cleaned.buffer);
  }catch(error){
    if(error instanceof ApiError&&error.code==="validation")return finish("failed");
    await finish("staged").catch(()=>undefined);
    throw error instanceof ApiError?error:new ApiError("unavailable");
  }
  return finish("ready",cleaned.buffer.length,cleaned.duration);
}

function parseRange(header:string,size:number){
  const parts=/^bytes=(\d{0,16})-(\d{0,16})$/.exec(header);
  if(!parts||(!parts[1]&&!parts[2]))return null;
  const suffix=parts[1]==="";
  const first=suffix?Math.max(0,size-Number(parts[2])):Number(parts[1]);
  const last=suffix||parts[2]===""?size-1:Math.min(size-1,Number(parts[2]));
  if(!Number.isSafeInteger(first)||first<0||first>last||first>=size)return null;
  return {first,last};
}

export async function viewPrivateMedia(actor:ActorContext,context:{threadId:string}|{reportId:string},mediaId:string,request:Request){
  const item=await withActor(actor,async(tx)=>{
    const [row]="threadId" in context
      ? await tx<MediaObject[]>`select * from app.thread_media_object(${context.threadId},${mediaId})`
      : await tx<MediaObject[]>`select * from app.report_media_object(${context.reportId},${mediaId})`;
    if(!row)throw new ApiError("not_found");
    return row;
  });
  const requested=request.headers.get("range");
  const range=requested===null?null:parseRange(requested,item.bytes);
  const headers=new Headers({"Content-Type":mediaMimeType[item.kind],"X-Content-Type-Options":"nosniff",
    "Accept-Ranges":"bytes","Cross-Origin-Resource-Policy":"same-origin"});
  if(requested!==null&&!range){
    headers.set("Content-Range",`bytes */${item.bytes}`);
    return new Response(null,{status:416,headers});
  }
  const length=range?range.last-range.first+1:item.bytes;
  const contentRange=range?`bytes ${range.first}-${range.last}/${item.bytes}`:null;
  headers.set("Content-Length",String(length));
  if(contentRange)headers.set("Content-Range",contentRange);
  if(request.method==="HEAD")return new Response(null,{status:range?206:200,headers});

  const provider=await storageMedia(item.kind,mediaId,false,range?`bytes=${range.first}-${range.last}`:undefined);
  const providerLength=provider.headers.get("content-length");
  const checkedLength=providerLength===null||Number(providerLength)===length;
  if(provider.status===(range?206:200)&&provider.body&&checkedLength&&
    (!contentRange||provider.headers.get("content-range")===contentRange)){
    return new Response(provider.body,{status:range?206:200,headers});
  }
  if(range&&provider.status===200){
    let buffer:Buffer;
    try{buffer=await readBoundedMedia(provider,item.bytes,item.kind==="photo"?photoLimit:voiceLimit);}
    catch{throw new ApiError("unavailable");}
    return new Response(new Uint8Array(buffer.subarray(range.first,range.last+1)),{status:206,headers});
  }
  await provider.body?.cancel().catch(()=>undefined);
  throw new ApiError("unavailable");
}

export async function cleanupChatMedia(){
  const items=await withRuntime(async(tx)=>{
    await tx`select app.reassign_pending_chat_reports(40)`;
    return tx<{upload_id:string;kind:MediaKind;lease:string;delete_raw:boolean;delete_ready:boolean}[]>
      `select * from app.claim_expired_chat_uploads(20)`;
  });
  let cleaned=0;
  for(let index=0;index<items.length;index+=4){
    const group=await Promise.allSettled(items.slice(index,index+4).map(async(item)=>{
      const [raw,ready]=await Promise.all([
        item.delete_raw?removeMedia(item.kind,item.upload_id,true).catch(()=>false):false,
        item.delete_ready?removeMedia(item.kind,item.upload_id,false).catch(()=>false):false,
      ]);
      if(raw||ready)await withRuntime(async(tx)=>{
        await tx`select app.finish_chat_cleanup(${item.upload_id},${item.lease},${raw},${ready})`;
      });
      return (!item.delete_raw||raw)&&(!item.delete_ready||ready);
    }));
    cleaned+=group.filter((result)=>result.status==="fulfilled"&&result.value).length;
  }
  return {claimed:items.length,cleaned};
}
