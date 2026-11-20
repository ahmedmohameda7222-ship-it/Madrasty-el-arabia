import "server-only";
import {
  broadcastEntry,broadcastOptions,broadcastPreview,broadcastReceipt,broadcastSent,
  type BroadcastDraft,type Locale,type pageQuerySchema,
} from "@madrasty/contracts";
import {z} from "zod";
import {commitCommand,hashCommand} from "@/server/db/commands";
import {appendAudit,appendEvent} from "@/server/db/outbox";
import {withActor,type ActorContext,type Transaction} from "@/server/db/scoped";
import {ApiError} from "@/server/http";

const position=z.object({id:z.uuid(),publishedAt:z.iso.datetime()});
const publicationTime=(tx:Transaction)=>tx`to_char(published_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "publishedAt"`;
const isStaff=(actor:ActorContext)=>actor.persona==="admin"||actor.persona==="teacher";
function positionOf(cursor?:string){
  if(!cursor)return null;
  try{return position.parse(JSON.parse(Buffer.from(cursor,"base64url").toString("utf8")));}
  catch{throw new ApiError("validation",{cursor:"error.validation"});}
}
function window<T extends {id:string;publishedAt:string}>(rows:T[],limit:number){
  const items=rows.slice(0,limit);
  const last=items.at(-1);
  return {items,nextCursor:rows.length>limit&&last?Buffer.from(JSON.stringify(position.parse(last))).toString("base64url"):undefined};
}
export function readBroadcastOptions(actor:ActorContext){
  return withActor(actor,async(tx)=>{
    const [scope]=await tx<{allowed:boolean}[]>`select app.has_capability('comms.publish') as allowed`;
    const classes=await tx`select id,code,name_ar as "nameAr",name_de as "nameDe" from app.broadcast_classes() order by code,id`;
    return broadcastOptions.parse({schoolWide:scope.allowed,classes});
  });
}

export function previewBroadcast(actor:ActorContext,input:BroadcastDraft){
  if(!isStaff(actor))throw new ApiError("forbidden");
  return withActor(actor,async(tx)=>{
    const classId=input.audience.kind==="class_guardians"?input.audience.classId:null;
    const [row]=await tx<{id:string;expiresAt:string;ar:number;de:number}[]>`
      select preview_id as id,to_char(expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "expiresAt",
        ar_count as ar,de_count as de
      from app.preview_school_broadcast(${input.audience.kind},${classId},${tx.json(input.copy)})`;
    return broadcastPreview.parse({...input,previewId:row.id,expiresAt:row.expiresAt,counts:{ar:row.ar,de:row.de}});
  });
}

export async function publishBroadcast(actor:ActorContext,key:string|null,previewId:string){
  if(!isStaff(actor))throw new ApiError("forbidden");
  const result=await commitCommand(actor,"comms.broadcast.publish",key,hashCommand({previewId}),{
    authorize:async(tx)=>{
      const [scope]=await tx<{allowed:boolean}[]>`select app.can_publish_broadcast_preview(${previewId}) as allowed`;
      if(!scope.allowed)throw new ApiError("not_found");
    },
    mutate:async(tx)=>{
      const [row]=await tx<{publicationId:string;recipientCount:number;inserted:boolean}[]>`
        select publication_id as "publicationId",reviewed_count as "recipientCount",inserted
        from app.publish_school_broadcast(${previewId})`;
      if(!row)throw new ApiError("stale_revision",{previewId:"error.stale_revision"});
      const {publicationId,recipientCount}=row;
      if(row.inserted){
        await appendAudit(tx,{action:"comms.broadcast_published",aggregateId:publicationId,metadata:{recipientCount}});
        await appendEvent(tx,{type:"broadcast.published",actorId:actor.accountId,aggregateId:publicationId,payload:{broadcastId:publicationId}});
      }
      return {publicationId,recipientCount};
    },
  });
  return broadcastReceipt.parse(result.data);
}

export function listSentBroadcasts(actor:ActorContext,input:z.infer<typeof pageQuerySchema>){
  if(!isStaff(actor))throw new ApiError("forbidden");
  const after=positionOf(input.cursor);
  return withActor(actor,async(tx)=>{
    const rows=await tx`select id,audience_kind as kind,class_id as "classId",class_ar as "classAr",class_de as "classDe",
        copy,${publicationTime(tx)},reviewed_count as "recipientCount",pending_count as pending,queued_count as queued,suppressed_count as suppressed
      from app.sent_school_broadcasts() as b
      where (${after?.id??null}::uuid is null or (b.published_at,b.id)<(${after?.publishedAt??null}::timestamptz,${after?.id??null}::uuid))
      order by b.published_at desc,b.id desc limit ${input.limit+1}`;
    return window(rows.map((row)=>broadcastSent.parse({...row,
      audience:row.kind==="class_guardians"?{kind:row.kind,classId:row.classId}:{kind:row.kind},
      dispatch:{pending:row.pending,queued:row.queued,suppressed:row.suppressed},
    })),input.limit);
  });
}

const receivedColumns=(tx:Transaction,locale:Locale)=>tx`id,${publicationTime(tx)},
  copy->${locale}::text->>'title' as title,copy->${locale}::text->>'body' as body`;
export function listReceivedBroadcasts(actor:ActorContext,input:z.infer<typeof pageQuerySchema>&{locale:Locale}){
  const after=positionOf(input.cursor);
  return withActor(actor,async(tx)=>{
    const rows=await tx`select ${receivedColumns(tx,input.locale)} from app.received_school_broadcasts(null) as b
      where (${after?.id??null}::uuid is null or (b.published_at,b.id)<(${after?.publishedAt??null}::timestamptz,${after?.id??null}::uuid))
      order by b.published_at desc,b.id desc limit ${input.limit+1}`;
    return window(broadcastEntry.array().parse(rows),input.limit);
  });
}
export function readReceivedBroadcast(actor:ActorContext,id:string,locale:Locale){
  return withActor(actor,async(tx)=>{
    const [row]=await tx`select ${receivedColumns(tx,locale)} from app.received_school_broadcasts(${id})`;
    if(!row)throw new ApiError("not_found");
    return broadcastEntry.parse(row);
  });
}
