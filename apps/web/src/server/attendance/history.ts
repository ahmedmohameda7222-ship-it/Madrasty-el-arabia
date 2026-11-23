import "server-only";
import {
  approvedAttendanceEntry, attendanceCancellationSchema, attendanceCorrectionSchema, attendanceRevisionHistory, familyAttendanceHistory,
  schoolDateSchema, type AttendanceStatus,
  type attendanceCancellationInput,type attendanceCorrectionInput,type childAttendanceQuery,type staffAttendanceQuery,
} from "@madrasty/contracts";
import { z } from "zod";
import { requireCapability } from "@/server/access/policies";
import { commitCommand,hashCommand } from "@/server/db/commands";
import { appendAudit,appendEvent } from "@/server/db/outbox";
import { withActor,type ActorContext,type Transaction } from "@/server/db/scoped";
import { ApiError } from "@/server/http";

type Query = z.infer<typeof childAttendanceQuery>;
const position=z.object({schoolDate:schoolDateSchema,id:z.uuid()});
function cursorKey(value?:string){
  if(!value)return null;
  try{
    if(!/^[A-Za-z0-9_-]+$/.test(value))throw new Error("cursor");
    return position.parse(JSON.parse(Buffer.from(value,"base64url").toString("utf8")));
  }catch{throw new ApiError("validation",{cursor:"error.validation"});}
}

function dateFields(query:Query){
  return {from:query.from??null,to:query.to??null};
}

async function historyRows(tx:Transaction,query:Query,scope:{
  child?:string;classId?:string;status?:string;guardian:boolean;
}){
  const {from,to}=dateFields(query),after=cursorKey(query.cursor);
  const rows=approvedAttendanceEntry.array().parse(await tx`
    select id,student_id as "studentId",student_name as "studentName",student_number as "studentNumber",
      class_id as "classId",class_code as "classCode",class_name_ar as "classNameAr",class_name_de as "classNameDe",
      school_date::text as "schoolDate",status,revision,cancelled
    from app.approved_attendance_rows(${scope.child??null}::uuid,${scope.classId??null}::uuid,
      ${from}::date,${to}::date,${scope.status??null}::text,${scope.guardian})
    where (${after?.id??null}::uuid is null or (school_date,id)<(${after?.schoolDate??null}::date,${after?.id??null}::uuid))
    order by school_date desc,id desc limit ${query.limit+1}`);
  const entries=rows.slice(0,query.limit);
  const end=entries.at(-1);
  return {entries,nextCursor:rows.length>query.limit&&end
    ?Buffer.from(JSON.stringify(position.parse(end))).toString("base64url"):undefined};
}

export function childHistory(actor:ActorContext,id:string,input:Query){
  return withActor(actor,async(tx)=>{
    if(actor.persona!=="guardian")throw new ApiError("forbidden");
    const [access]=await tx<{allowed:boolean}[]>`select app.has_child_link(${id}) as allowed`;
    if(!access.allowed)throw new ApiError("not_found");
    const found=await historyRows(tx,input,{child:id,guardian:true});
    const {from,to}=dateFields(input);
    const ownPreliminary=await tx`
      select e.id,e.school_date::text as "schoolDate",
        to_char(e.submitted_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "submittedAt"
      from app.family_excuse e
      where e.student_id=${id} and e.reporter_id=app.actor_account() and e.state='pending'
        and (${from}::date is null or e.school_date>=${from}::date)
        and (${to}::date is null or e.school_date<=${to}::date)
        and not exists(select 1 from app.approved_attendance_rows(${id}::uuid,null,e.school_date,e.school_date,null,true))
      order by e.school_date desc,e.id desc limit 50`;
    return {page:familyAttendanceHistory.parse({entries:found.entries,ownPreliminary}),nextCursor:found.nextCursor};
  });
}

export function staffHistory(actor:ActorContext,input:z.infer<typeof staffAttendanceQuery>){
  return withActor(actor,async(tx)=>{
    if(actor.persona==="guardian")throw new ApiError("forbidden");
    if(actor.persona==="admin")await requireCapability(tx,actor,"attendance.supervise");
    return historyRows(tx,input,{guardian:false,classId:input.classId,status:input.status});
  });
}

export function attendanceRowHistory(actor:ActorContext,id:string){
  if(actor.persona==="admin")throw new ApiError("forbidden");
  return withActor(actor,async(tx)=>{
    const [context]=await tx`
      select row.sheet_id as "sheetId",row.class_id as "classId",row.school_date::text as "schoolDate",row.row_payload as row,
        ctx.calendar_cancelled as "calendarCancelled",ctx.approval_revision as "approvalRevision",
        ctx.can_correct as "canCorrect",ctx.can_cancel as "canCancel"
      from app.private_attendance_row(${id}) row join app.attendance_correction_context(${id}) ctx on ctx.sheet_id=row.sheet_id`;
    if(!context)throw new ApiError("not_found");
    const revisions=await tx`
      select id,kind,revision,prior_status as "priorStatus",status,actor_name as "actorName",reason,
        to_char(occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "occurredAt"
      from app.staff_attendance_revisions(${id}) order by revision desc`;
    return attendanceRevisionHistory.parse({...context,revisions});
  });
}

type Changed = {
  result:string;rowId:string;studentId:string;classId:string;schoolDate:string;
  previousStatus:AttendanceStatus;status:AttendanceStatus;revision:number;
  previousEventId:string|null;calendarCancelled:boolean;
};

async function correctionEvent(tx:Transaction,actorId:string,value:Changed){
  const event=await appendEvent(tx,{type:"attendance.corrected",aggregateId:value.rowId,actorId,payload:{
    studentId:value.studentId,classId:value.classId,schoolDate:value.schoolDate,priorStatus:value.previousStatus,
    status:value.status,revision:value.revision,priorEventId:value.previousEventId,calendarCancelled:value.calendarCancelled,
  }});
  await tx`select app.attach_attendance_approved_event(${value.rowId},${value.revision},${event})`;
}

export function correctAttendance(actor:ActorContext,id:string,key:string|null,input:z.infer<typeof attendanceCorrectionInput>){
  return commitCommand(actor,"attendance.record.correct",key,hashCommand({id,...input}),{
    authorize:async(tx)=>{
      if(actor.persona!=="teacher")throw new ApiError("forbidden");
      const [row]=await tx<{allowed:boolean}[]>`
        select app.attendance_scope(sheet.class_id,sheet.school_date,'attendance.approve') as allowed
        from app.attendance_row pupil join app.attendance_sheet sheet on sheet.id=pupil.sheet_id
        where pupil.id=${id}
      `;
      if(!row?.allowed)throw new ApiError("forbidden");
    },
    mutate:async(tx)=>{
      const [value]=await tx<Omit<Changed,"rowId">[]>`
        select result,student_id as "studentId",class_id as "classId",school_date::text as "schoolDate",
          previous_status as "previousStatus",status,revision,previous_event_id as "previousEventId",calendar_cancelled as "calendarCancelled"
        from app.correct_attendance_record(${id},${input.revision},${input.status}::app.attendance_status,${input.reason})`;
      if(value.result==="stale")throw new ApiError("stale_revision");
      await appendAudit(tx,{action:"attendance.corrected",aggregateId:id});
      await correctionEvent(tx,actor.accountId,{...value,rowId:id});
      return attendanceCorrectionSchema.parse({...value,rowId:id});
    },
  });
}

type CalendarChanged = Omit<Changed,"previousStatus"|"calendarCancelled"|"rowId"> & {rowId:string|null};
export function cancelApprovedDate(actor:ActorContext,id:string,key:string|null,input:z.infer<typeof attendanceCancellationInput>){
  // Retroactive calendar cancellation changes approved attendance evidence.
  // It must not be performed by an administrative supervisor. Its historical
  // records stay readable; a separate teacher-verified exception workflow is required.
  throw new ApiError("forbidden");
  return commitCommand(actor,"attendance.sheet.cancel_for_calendar",key,hashCommand({id,...input}),{
    authorize:async(tx)=>{
      await requireCapability(tx,actor,"attendance.supervise");
      await requireCapability(tx,actor,"school.manage");
      const [row]=await tx`select 1 from app.attendance_sheet where id=${id} and state='approved'`;
      if(!row)throw new ApiError("not_found");
    },
    mutate:async(tx)=>{
      const rows=await tx<CalendarChanged[]>`
        select result,row_id as "rowId",student_id as "studentId",class_id as "classId",school_date::text as "schoolDate",
          status,revision,previous_event_id as "previousEventId"
        from app.cancel_approved_attendance_day(${id},${input.approvalRevision},${input.reason})`;
      const first=rows[0];
      if(first.result==="stale")throw new ApiError("stale_revision");
      for(const row of rows){
        if(row.rowId)await correctionEvent(tx,actor.accountId,{...row,rowId:row.rowId,previousStatus:row.status,calendarCancelled:true});
      }
      await appendAudit(tx,{action:"attendance.calendar_cancelled",aggregateId:id});
      return attendanceCancellationSchema.parse({
        classId:first.classId,schoolDate:first.schoolDate,calendarCancelled:true,correctedRows:rows.filter((row)=>row.rowId).length,
      });
    },
  });
}

export async function approvedAttendanceCounts(tx:Transaction,input:{
  studentId?:string;classId?:string;from?:string;to?:string;
}){
  return tx<{status:AttendanceStatus;count:number}[]>`
    select status,total::int as count from app.approved_attendance_counts(
      ${input.studentId??null}::uuid,${input.classId??null}::uuid,${input.from??null}::date,${input.to??null}::date
    )`;
}
