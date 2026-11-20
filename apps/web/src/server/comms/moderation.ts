import "server-only";
import { fileMessageReport,messageReportEntry,messageReportQuery,messageReportReceipt,messageReportUpdate } from "@madrasty/contracts";
import { z } from "zod";
import { commitCommand,hashCommand } from "@/server/db/commands";
import { appendAudit } from "@/server/db/outbox";
import { withActor,type ActorContext,type Transaction } from "@/server/db/scoped";
import { ApiError } from "@/server/http";

const position=z.object({id:z.uuid(),createdAt:z.iso.datetime()});
const columns=(tx:Transaction)=>tx`
  id,thread_id as "threadId",message_id as "messageId",state,action,revision,reason,message_body as "messageBody",
  author_name as "authorName",attachments,to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "createdAt",
  to_char(message_created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "messageCreatedAt"`;
const details=async(tx:Transaction,id:string)=>{
  const [row]=await tx`select ${columns(tx)} from app.chat_report_rows(${id})`;
  if(!row)throw new ApiError("not_found");
  return messageReportEntry.parse(row);
};
function readCursor(value?:string){
  if(!value)return null;
  try{return position.parse(JSON.parse(Buffer.from(value,"base64url").toString("utf8")));}
  catch{throw new ApiError("validation",{cursor:"error.validation"});}
}

export async function reportMessage(actor:ActorContext,key:string|null,input:z.infer<typeof fileMessageReport>){
  const result=await commitCommand(actor,"comms.message.report",key,hashCommand(input),{
    authorize:async(tx)=>{
      const [scope]=await tx<{allowed:boolean}[]>`
        select app.thread_can_access(${input.threadId}) and exists(
          select 1 from app.chat_message_projection(${input.threadId},${input.messageId},null)
        ) as allowed`;
      if(!scope.allowed)throw new ApiError("not_found");
    },
    mutate:async(tx)=>{
      const [row]=await tx<{report_id:string;inserted:boolean}[]>`
        select * from app.file_chat_report(${input.threadId},${input.messageId},${input.reason})`;
      if(row.inserted)await appendAudit(tx,{action:"comms.message_report_filed",aggregateId:row.report_id});
      return {reportId:row.report_id};
    },
  });
  return messageReportReceipt.parse(result.data);
}

export async function canManageMessageReports(actor:ActorContext){
  if(actor.persona!=="admin"||actor.assurance!=="aal2")return false;
  return withActor(actor,async(tx)=>{
    const [row]=await tx<{allowed:boolean}[]>`select app.can_manage_chat_reports() as allowed`;
    return row.allowed;
  });
}

export function mayManageMessageReports(session:import("@madrasty/contracts").SchoolSession){
  return canManageMessageReports({
    requestId:crypto.randomUUID(),accountId:session.accountId,sessionId:session.sessionId,
    persona:session.activePersona,assurance:session.assurance,
  });
}

export function listMessageReports(actor:ActorContext,input:z.infer<typeof messageReportQuery>){
  if(actor.persona!=="admin")throw new ApiError("forbidden");
  const after=readCursor(input.cursor);
  return withActor(actor,async(tx)=>{
    const [scope]=await tx<{allowed:boolean}[]>`select app.can_manage_chat_reports() as allowed`;
    if(!scope.allowed)throw new ApiError("forbidden");
    const rows=await tx`select ${columns(tx)} from app.chat_report_rows(null) as r
      where (${input.state??null}::text is null or r.state=${input.state??null})
      and (${after?.id??null}::uuid is null or (r.created_at,r.id)<(${after?.createdAt??null}::timestamptz,${after?.id??null}::uuid))
      order by r.created_at desc,r.id desc limit ${input.limit+1}`;
    const items=messageReportEntry.array().parse(rows.slice(0,input.limit));
    const end=items.at(-1);
    return {items,nextCursor:rows.length>input.limit&&end?Buffer.from(JSON.stringify(position.parse(end))).toString("base64url"):undefined};
  });
}

export function readMessageReport(actor:ActorContext,id:string){
  return withActor(actor,(tx)=>details(tx,id));
}

export async function reviewMessageReport(actor:ActorContext,id:string,key:string|null,input:z.infer<typeof messageReportUpdate>){
  await commitCommand(actor,"comms.report.review",key,hashCommand({id,...input}),{
    authorize:async(tx)=>{await details(tx,id);},
    mutate:async(tx)=>{
      const [row]=await tx<{revision:number|null}[]>`
        select app.review_chat_report(${id},${input.revision},${input.state},${input.action??null}::text) as revision`;
      if(row.revision===null)throw new ApiError("stale_revision");
      await appendAudit(tx,{action:"comms.message_report_reviewed",aggregateId:id,
        metadata:{state:input.state,action:input.action??null,revision:row.revision}});
      return {revision:row.revision};
    },
  });
  return readMessageReport(actor,id);
}
