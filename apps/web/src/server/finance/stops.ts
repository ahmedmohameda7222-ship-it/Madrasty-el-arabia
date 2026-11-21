import "server-only";
import {
  enrollmentStop,stopOptions,stopState,type stopDecision,type stopQuery,type stopSubmit,type stopWithdraw,type SchoolSession,
} from "@madrasty/contracts";
import {z} from "zod";
import {commitCommand,hashCommand} from "@/server/db/commands";
import {appendAudit,appendAudits,appendEvent} from "@/server/db/outbox";
import {withActor,type ActorContext,type Transaction} from "@/server/db/scoped";
import {ApiError} from "@/server/http";

const utc="YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"";
const position=z.object({id:z.uuid(),createdAt:z.iso.datetime()});
const effects=z.object({invoiceId:z.uuid(),effect:z.enum(["review","cancelled"]),reviewId:z.uuid().nullable()}).array();
const fields=(tx:Transaction)=>tx`id,student_id as "studentId",student_name as "studentName",student_number as "studentNumber",
  requester_id as "requesterId",to_char(last_month,'YYYY-MM') as "lastAttendanceMonth",to_char(start_month,'YYYY-MM') as "startMonth",
  to_char(end_month,'YYYY-MM') as "endMonthExclusive",state,duration,reason,note,revision,
  to_char(created_at at time zone 'UTC',${utc}) as "createdAt",to_char(resolved_at at time zone 'UTC',${utc}) as "resolvedAt",
  can_decide as "canDecide",can_withdraw as "canWithdraw"`;

export function mayManageStops(session:SchoolSession){
  if(session.activePersona!=="admin"||session.assurance!=="aal2")return Promise.resolve(false);
  return withActor({accountId:session.accountId,sessionId:session.sessionId,persona:session.activePersona,
    assurance:session.assurance,requestId:crypto.randomUUID()},async(tx)=>{
    const [row]=await tx<{allowed:boolean}[]>`select app.enrollment_stop_staff() as allowed`;
    return row.allowed;
  });
}
export function loadStopOptions(actor:ActorContext){
  return withActor(actor,async(tx)=>{
    const [row]=await tx`select to_char(school_month,'YYYY-MM') as "schoolMonth",may_decide as "mayDecide"
      from app.enrollment_stop_options()`;
    if(!row)throw new ApiError("forbidden");
    if(!row.schoolMonth)throw new ApiError("unavailable");
    return stopOptions.parse(row);
  });
}
async function readStop(tx:Transaction,id:string){
  const [row]=await tx`select ${fields(tx)} from app.enrollment_stop_rows(${id},null,null)`;
  if(!row)throw new ApiError("not_found");
  return enrollmentStop.parse(row);
}
export const readEnrollmentStop=(actor:ActorContext,id:string)=>withActor(actor,(tx)=>readStop(tx,id));

export function listEnrollmentStops(actor:ActorContext,input:z.infer<typeof stopQuery>){
  let after:z.infer<typeof position>|null=null;
  if(input.cursor){
    try{after=position.parse(JSON.parse(Buffer.from(input.cursor,"base64url").toString("utf8")));}
    catch{throw new ApiError("validation",{cursor:"error.validation"});}
  }
  return withActor(actor,async(tx)=>{
    const [scope]=await tx<{allowed:boolean}[]>`select app.actor_persona()='guardian' or app.enrollment_stop_staff() as allowed`;
    if(!scope.allowed)throw new ApiError("forbidden");
    const rows=enrollmentStop.array().parse(await tx`select ${fields(tx)}
      from app.enrollment_stop_rows(null,${input.studentId??null}::uuid,${input.status??null}::text) s
      where (${after?.id??null}::uuid is null or (s.created_at,s.id)<(${after?.createdAt??null}::timestamptz,${after?.id??null}::uuid))
      order by s.created_at desc,s.id desc limit ${input.limit+1}`);
    const items=rows.slice(0,input.limit),last=items.at(-1);
    return {items,nextCursor:rows.length>input.limit&&last?Buffer.from(JSON.stringify(position.parse(last))).toString("base64url"):undefined};
  });
}

async function postStopChange(tx:Transaction,actor:ActorContext,id:string,verb:"requested"|"withdrawn"|"approved"|"rejected"){
  const item=await readStop(tx,id),type="enrollment.stop_"+verb;
  const payload={requestId:id,studentId:item.studentId,requesterId:item.requesterId,startMonth:item.startMonth,
    endMonthExclusive:item.endMonthExclusive,state:item.state,revision:item.revision};
  await appendEvent(tx,{type,aggregateId:id,actorId:actor.accountId,payload});
  await appendAudit(tx,{action:type,aggregateId:id,metadata:{studentId:item.studentId,revision:item.revision,
    startMonth:item.startMonth,endMonthExclusive:item.endMonthExclusive}});
  return item;
}

export async function requestEnrollmentStop(actor:ActorContext,key:string|null,input:z.infer<typeof stopSubmit>){
  const result=await commitCommand(actor,"enrollment.stop.request",key,hashCommand(input),{
    authorize:async(tx)=>{
      const [row]=await tx<{allowed:boolean}[]>`select app.actor_persona()='guardian' and app.has_child_link(${input.studentId}) as allowed`;
      if(!row.allowed)throw new ApiError("not_found");
    },
    mutate:async(tx)=>{
      const [row]=await tx<{id:string}[]>`select app.create_enrollment_stop(${input.studentId},${input.lastAttendanceMonth+"-01"}::date,
        ${input.duration},${input.reason}) as id`;
      await postStopChange(tx,actor,row.id,"requested");
      return {id:row.id};
    },
  });
  return readEnrollmentStop(actor,result.data.id);
}

export async function changeEnrollmentStop(actor:ActorContext,id:string,key:string|null,input:z.infer<typeof stopWithdraw>|z.infer<typeof stopDecision>){
  const operation="action" in input?input.action:input.decision;
  await commitCommand(actor,"enrollment.stop."+operation,key,hashCommand({id,...input}),{
    authorize:async(tx)=>{
      const [row]=await tx<{allowed:boolean}[]>`select app.enrollment_stop_visible(${id},${operation==="withdraw"?"withdraw":"decide"}) as allowed`;
      if(!row.allowed)throw new ApiError("not_found");
    },
    mutate:async(tx)=>{
      const [row]=await tx<{state:unknown;revision:number;effects:unknown}[]>`select state,revision,effects
        from app.change_enrollment_stop(${id},${input.revision},${operation},${"note" in input?input.note??null:null}::text)`;
      if(!row)throw new ApiError("stale_revision");
      await postStopChange(tx,actor,id,operation==="approve"?"approved":operation==="reject"?"rejected":"withdrawn");
      await appendAudits(tx,effects.parse(row.effects).map((entry)=>({
        action:entry.effect==="review"?"finance.stop_review_opened":"finance.stop_charge_cancelled",
        aggregateId:entry.reviewId??entry.invoiceId,metadata:{invoiceId:entry.invoiceId,stopId:id},
      })));
      return {state:stopState.parse(row.state),revision:row.revision};
    },
  });
  return readEnrollmentStop(actor,id);
}
