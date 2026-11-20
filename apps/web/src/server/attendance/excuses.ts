import "server-only";
import {
  attendanceRowDetail, familyExcuseCommandReceipt, familyExcuseDay, familyExcuseReceipt,
  type actualArrivalInput, type familyExcuseInput,
} from "@madrasty/contracts";
import type { z } from "zod";
import { commitCommand, hashCommand } from "@/server/db/commands";
import { appendAudit, appendEvent } from "@/server/db/outbox";
import { withActor, type ActorContext, type Transaction } from "@/server/db/scoped";
import { ApiError } from "@/server/http";

async function requireChild(actor:ActorContext,tx:Transaction,childId:string){
  if(actor.persona!=="guardian")throw new ApiError("forbidden");
  const [child]=await tx<{id:string;displayName:string}[]>`
    select id,display_name as "displayName" from app.student where id=${childId} and app.has_child_link(id)`;
  if(!child)throw new ApiError("not_found");
  return child;
}

async function teachingDay(tx:Transaction,child:string,date:string){
  const [result]=await tx<{allowed:boolean}[]>`select app.family_excuse_day(${child},${date}::date) as allowed`;
  return result.allowed;
}

function receipts(tx:Transaction,childId:string,date:string,id?:string){
  return tx`
    select id,student_id as "studentId",school_date::text as "schoolDate",reason,state,revision,
      row_revision as "rowRevision",withdrawable,
      to_char(submitted_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "submittedAt"
    from app.family_excuse_receipts(${childId},${date}::date,${id??null}::uuid)
    order by submitted_at desc,id desc limit 50`.then((rows)=>familyExcuseReceipt.array().parse(rows));
}
async function oneReceipt(tx:Transaction,childId:string,date:string,id:string){
  const [row]=await receipts(tx,childId,date,id);
  if(!row)throw new ApiError("not_found");
  return familyExcuseCommandReceipt.parse(row);
}

export function readFamilyExcuses(actor:ActorContext,childId:string,requested?:string){
  return withActor(actor,async(tx)=>{
    const child=await requireChild(actor,tx,childId);
    const [value]=await tx<{day:string|null}[]>`select coalesce(${requested??null}::date,app.school_today())::text as day`;
    if(!value?.day)throw new ApiError("unavailable");
    const schoolDate=value.day;
    return familyExcuseDay.parse({child,schoolDate,teachingDay:await teachingDay(tx,childId,schoolDate),
      receipts:await receipts(tx,childId,schoolDate)});
  });
}

export function submitFamilyExcuse(actor:ActorContext,childId:string,key:string|null,input:z.infer<typeof familyExcuseInput>){
  return commitCommand(actor,"attendance.family_excuse.create",key,hashCommand({childId,...input}),{
    authorize:async(tx)=>{await requireChild(actor,tx,childId);},
    mutate:async(tx)=>{
      await tx`select app.lock_school_calendar()`;
      if(!await teachingDay(tx,childId,input.schoolDate))throw new ApiError("closed_day");
      const [created]=await tx<{id:string}[]>`
        select excuse_key as id from app.record_family_excuse(${childId},${input.schoolDate}::date,${input.reason})`;
      return oneReceipt(tx,childId,input.schoolDate,created.id);
    },
  });
}

export function withdrawFamilyExcuse(actor:ActorContext,childId:string,id:string,key:string|null,revision:number){
  async function ownDate(tx:Transaction){
    await requireChild(actor,tx,childId);
    const [row]=await tx<{date:string}[]>`select school_date::text as date from app.family_excuse where id=${id} and student_id=${childId}`;
    if(!row)throw new ApiError("not_found");
    return row.date;
  }
  return commitCommand(actor,"attendance.family_excuse.withdraw",key,hashCommand({childId,id,revision}),{
    authorize:async(tx)=>{await ownDate(tx);},
    mutate:async(tx)=>{
      const date=await ownDate(tx);
      const [result]=await tx<{revision:number|null}[]>`
        select app.withdraw_family_excuse(${childId},${id},${revision}) as revision`;
      if(result.revision===null)throw new ApiError("stale_revision");
      return oneReceipt(tx,childId,date,id);
    },
  });
}

async function rowDetail(tx:Transaction,id:string,showReason=false){
  const [row]=await tx`
    select sheet_id as "sheetId",class_id as "classId",school_date::text as "schoolDate",
      row_payload as row,case when ${showReason} then excuse_reason end as "excuseReason"
    from app.private_attendance_row(${id})`;
  if(!row)throw new ApiError("not_found");
  return attendanceRowDetail.parse(row);
}

export function readStaffAttendanceRow(actor:ActorContext,id:string,showReason:boolean){
  return withActor(actor,(tx)=>rowDetail(tx,id,showReason));
}

export function confirmArrival(actor:ActorContext,id:string,key:string|null,input:z.infer<typeof actualArrivalInput>){
  async function markable(tx:Transaction){
    const data=await rowDetail(tx,id);
    const [scope]=await tx<{allowed:boolean}[]>`
      select app.attendance_scope(${data.classId},${data.schoolDate}::date,'attendance.mark') as allowed`;
    if(!scope.allowed)throw new ApiError("forbidden");
    return data;
  }
  return commitCommand(actor,"attendance.row.confirm_arrival",key,hashCommand({id,...input}),{
    authorize:async(tx)=>{await markable(tx);},
    mutate:async(tx)=>{
      await tx`select app.lock_school_calendar()`;
      const current=await markable(tx);
      const [calendar]=await tx<{open:boolean}[]>`
        select app.attendance_open_for_writes(${current.classId},${current.schoolDate}::date) as open`;
      if(!calendar.open)throw new ApiError("closed_day");
      const [result]=await tx<{state:string;precedingExcuse:boolean}[]>`
        select result as state,preceding_excuse as "precedingExcuse"
        from app.confirm_actual_arrival(${id},${input.revision},${input.status}::app.attendance_status)`;
      if(result.state==="stale")throw new ApiError("stale_revision");
      const updated=await rowDetail(tx,id);
      await appendAudit(tx,{action:"attendance.arrival_confirmed",aggregateId:id});
      await appendEvent(tx,{type:"attendance.arrival_confirmed",actorId:actor.accountId,aggregateId:id,payload:{
        studentId:updated.row.studentId,classId:updated.classId,schoolDate:updated.schoolDate,revision:updated.row.revision,
        status:updated.row.status,precedingExcuse:result.precedingExcuse,
      }});
      return updated;
    },
  });
}
