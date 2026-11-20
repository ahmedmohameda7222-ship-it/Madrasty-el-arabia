import "server-only";
import {deliveryStatusItem,type deliveryHistoryQuery,type SchoolSession} from "@madrasty/contracts";
import {z} from "zod";
import {commitCommand,hashCommand} from "@/server/db/commands";
import {appendAudit} from "@/server/db/outbox";
import {withActor,type ActorContext,type Transaction} from "@/server/db/scoped";
import {ApiError} from "@/server/http";

const cursorSchema=z.object({id:z.uuid(),createdAt:z.iso.datetime()});
const time="YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"";
function parseCursor(value?:string){
  if(!value)return null;
  try{return cursorSchema.parse(JSON.parse(Buffer.from(value,"base64url").toString("utf8")));}
  catch{throw new ApiError("validation",{cursor:"error.validation"});}
}

async function allowed(tx:Transaction){
  const [row]=await tx<{allowed:boolean}[]>`select app.may_operate_delivery_queue() as allowed`;
  return row.allowed;
}
export function canViewDeliveryStatus(actor:ActorContext){
  if(actor.persona==="guardian"||actor.persona==="admin"&&actor.assurance!=="aal2")return Promise.resolve(false);
  return withActor(actor,allowed);
}
export function mayViewDeliveryStatus(session:SchoolSession){
  return canViewDeliveryStatus({accountId:session.accountId,sessionId:session.sessionId,persona:session.activePersona,
    assurance:session.assurance,requestId:crypto.randomUUID()});
}
export function listDeliveryStatus(actor:ActorContext,input:z.infer<typeof deliveryHistoryQuery>){
  const cursor=parseCursor(input.cursor);
  return withActor(actor,async(tx)=>{
    if(!await allowed(tx))throw new ApiError("forbidden");
    const source=await tx`
      select j.id,j.kind,j.channel,j.state,j.attempts,j.revision,j.failure,j.can_redrive as "canRedrive",
        to_char(j.due_at at time zone 'UTC',${time}) as "dueAt",to_char(j.created_at at time zone 'UTC',${time}) as "createdAt",
        to_char(j.changed_at at time zone 'UTC',${time}) as "updatedAt"
      from app.delivery_overview() j
      where (${input.kind??null}::text is null or j.kind=${input.kind??null})
        and (${input.state??null}::text is null or j.state=${input.state??null})
        and (${cursor?.id??null}::uuid is null or (j.created_at,j.id)<(${cursor?.createdAt??null}::timestamptz,${cursor?.id??null}::uuid))
      order by j.created_at desc,j.id desc limit ${input.limit+1}`;
    const items=deliveryStatusItem.array().parse(source.slice(0,input.limit)),last=items.at(-1);
    return {items,nextCursor:source.length>input.limit&&last?Buffer.from(JSON.stringify(cursorSchema.parse(last))).toString("base64url"):undefined};
  });
}
export async function redriveDeliveryStatus(actor:ActorContext,id:string,revision:number,key:string|null){
  const command=await commitCommand(actor,"comms.delivery.redrive",key,hashCommand({id,revision}),{
    authorize:async(tx)=>{
      const [row]=await tx<{permitted:boolean}[]>`select exists(select 1 from app.delivery_overview() d where d.id=${id}) as permitted`;
      if(!row.permitted)throw new ApiError("not_found");
    },
    mutate:async(tx)=>{
      const [row]=await tx<{revision:number|null}[]>`select app.redrive_delivery_job(${id},${revision}) as revision`;
      if(row.revision===null)throw new ApiError("stale_revision");
      await appendAudit(tx,{action:"comms.delivery_redriven",aggregateId:id,metadata:{revision:row.revision}});
      return {id,revision:row.revision,state:"queued" as const};
    },
  });
  return command.data;
}
