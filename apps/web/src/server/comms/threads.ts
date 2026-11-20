import "server-only";
import {
  homeworkContact,officeCase,officeDelegate,threadDetail,threadReceipt,threadReferenceView,threadSummary,
  type officeCaseInput,type startThreadInput,type threadQuery,
} from "@madrasty/contracts";
import { z } from "zod";
import { resolveDirectoryTarget } from "@/server/identity/directory";
import { commitCommand,hashCommand } from "@/server/db/commands";
import { appendAudit } from "@/server/db/outbox";
import { withActor,type ActorContext,type Transaction } from "@/server/db/scoped";
import { ApiError } from "@/server/http";

const cursorPosition=z.object({id:z.uuid(),createdAt:z.iso.datetime()});
function readCursor(value?:string){
  if(!value)return null;
  try{
    if(!/^[A-Za-z0-9_-]{1,270}$/.test(value))throw new Error("cursor");
    return cursorPosition.parse(JSON.parse(Buffer.from(value,"base64url").toString("utf8")));
  }catch{throw new ApiError("validation",{cursor:"error.validation"});}
}

export function startThread(actor:ActorContext,key:string|null,input:z.infer<typeof startThreadInput>){
  const context=input.context;
  return commitCommand(actor,"comms.thread.open",key,hashCommand(input),{
    authorize:async(tx)=>{
      await resolveDirectoryTarget(tx,input.target);
      if(context){
        const [visible]=await tx<{ok:boolean}[]>`select app.thread_reference_allowed(${context.kind},${context.id}) as ok`;
        if(!visible.ok)throw new ApiError("not_found");
        const match=context.kind==="homework"?input.target.kind==="person":
          input.target.kind==="office"&&input.target.id===(context.kind==="invoice"?"accounts":"student_affairs");
        if(!match)throw new ApiError("not_found");
        if(context.kind==="homework"){
          const [teacher]=await tx`select 1 from app.homework_conversation_contacts(${context.id}) where contact_id=${input.target.id}`;
          if(!teacher)throw new ApiError("not_found");
        }
      }
      const [available]=await tx<{ok:boolean}[]>`select app.thread_key_available(
        ${input.target.kind},${input.target.id},${context?.kind??null}::text,${context?.id??null}::uuid) as ok`;
      if(!available.ok)throw new ApiError("not_found");
    },
    mutate:async(tx)=>{
      const [row]=await tx`select thread_id as "threadId",kind,can_reply as "canReply",case_id as "caseId"
        from app.open_thread(${input.target.kind},${input.target.id},${context?.kind??null}::text,${context?.id??null}::uuid)`;
      return threadReceipt.parse({...row,caseId:row.caseId??undefined});
    },
  });
}
const fields=(tx:Transaction)=>tx`id,kind,contact_name as "contactName",inbox,case_id as "caseId",case_status as "caseStatus",
  case_revision as "caseRevision",to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "createdAt",
  can_reply as "canReply",can_manage_case as "canManageCase"`;
export function threads(actor:ActorContext,input:z.infer<typeof threadQuery>){
  return withActor(actor,async(tx)=>{
    const cursor=readCursor(input.cursor);
    const rows=threadSummary.array().parse(await tx`select ${fields(tx)} from app.thread_projection(null,${input.inbox??null}::text)
      where (${input.kind??null}::text is null or kind=${input.kind??null})
        and (${cursor?.id??null}::uuid is null or (created_at,id)<(${cursor?.createdAt??null}::timestamptz,${cursor?.id??null}::uuid))
      order by created_at desc,id desc limit ${input.limit+1}`);
    const items=rows.slice(0,input.limit),last=items.at(-1);
    return {items,nextCursor:rows.length>input.limit&&last
      ?Buffer.from(JSON.stringify({id:last.id,createdAt:last.createdAt})).toString("base64url"):undefined};
  });
}
export function readThread(actor:ActorContext,id:string){
  return withActor(actor,async(tx)=>{
    const [row]=await tx`select ${fields(tx)} from app.thread_projection(${id},null)`;
    if(!row)throw new ApiError("not_found");
    const references=threadReferenceView.array().parse(await tx`select reference_kind as kind,reference_id as id,child_id as "childId" from app.thread_references(${id})`);
    return threadDetail.parse({...row,references});
  });
}
export function homeworkContacts(actor:ActorContext,id:string){
  return withActor(actor,async(tx)=>{
    if(actor.persona!=="guardian")throw new ApiError("forbidden");
    const [access]=await tx<{ok:boolean}[]>`select app.thread_reference_allowed('homework',${id}) as ok`;
    if(!access.ok)throw new ApiError("not_found");
    return homeworkContact.array().parse(await tx`select contact_id as id,display_name as "displayName"
      from app.homework_conversation_contacts(${id}) order by display_name,contact_id`);
  });
}
async function caseRecord(tx:Transaction,id:string){
  const [row]=await tx`select id,thread_id as "threadId",inbox,status,assignee_id as "assigneeId",assignee_name as "assigneeName",
    revision,can_manage as "canManage",case when origin_id is not null then jsonb_build_object('kind',origin_kind,'id',origin_id) end as origin
    from app.office_case_visible(${id})`;
  if(!row)throw new ApiError("not_found");
  const delegates=row.canManage?officeDelegate.array().parse(await tx`select account_id as "accountId",display_name as "displayName"
    from app.office_case_delegates(${id}) order by display_name,account_id`):[];
  return officeCase.parse({...row,delegates});
}
export function readOfficeCase(actor:ActorContext,id:string){
  return withActor(actor,(tx)=>caseRecord(tx,id));
}
export async function updateOfficeCase(actor:ActorContext,id:string,key:string|null,input:z.infer<typeof officeCaseInput>){
  await commitCommand(actor,"comms.office_case.change",key,hashCommand({id,...input}),{
    authorize:async(tx)=>{
      const value=await caseRecord(tx,id);
      if(!value.canManage)throw new ApiError("not_found");
    },
    mutate:async(tx)=>{
      const [saved]=await tx<{revision:number|null}[]>`select app.change_office_case(${id},${input.revision},${input.status??null}::text,
        ${input.assigneeId??null}::uuid,${input.assigneeId!==undefined}) as revision`;
      if(saved.revision===null)throw new ApiError("stale_revision");
      await appendAudit(tx,{action:"comms.office_case_updated",aggregateId:id,metadata:{revision:saved.revision}});
      return {revision:saved.revision};
    },
  });
  return readOfficeCase(actor,id);
}
