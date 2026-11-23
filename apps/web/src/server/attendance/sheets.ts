import "server-only";
import {
  attendanceChanges, attendanceClasses, attendancePendingSchema, attendanceRowSchema, attendanceSheetSchema,
  type AttendanceChanges, type AttendanceRow, type AttendanceSheet, type AttendanceStatus,
  type attendanceApproveInput, type attendanceBulkInput, type attendanceEditInput, type attendancePendingQuery,
} from "@madrasty/contracts";
import type { z } from "zod";
import { requireCapability } from "@/server/access/policies";
import { commitCommand, hashCommand, requireRevision } from "@/server/db/commands";
import { appendAudit, appendEvent } from "@/server/db/outbox";
import { withActor, type ActorContext, type Transaction } from "@/server/db/scoped";
import { ApiError } from "@/server/http";

type ClassDay = {
  classId:string;yearId:string;code:string;nameAr:string;nameDe:string;
  teachingDay:boolean;closedReason:string|null;canMark:boolean;canApprove:boolean;
};
type StoredSheet = {
  id:string;classId:string;yearId:string;schoolDate:string;state:"open"|"approved";
  rosterRevision:number;approvalRevision:number;approvedAt:string|null;
};
type Mark = { rowId:string;revision:number;status:AttendanceStatus|null };
type Operation = "attendance.mark"|"attendance.approve";

const sheetFields=(tx:Transaction)=>tx`
  id,class_id as "classId",year_id as "yearId",school_date::text as "schoolDate",state,
  roster_revision as "rosterRevision",approval_revision as "approvalRevision",
  to_char(approved_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "approvedAt"
`;

async function classDay(tx:Transaction,id:string,date:string){
  const [context]=await tx<ClassDay[]>`
    select class_id as "classId",year_id as "yearId",class_code as code,class_name_ar as "nameAr",class_name_de as "nameDe",
      teaching_day as "teachingDay",closed_reason as "closedReason",can_mark as "canMark",can_approve as "canApprove"
    from app.attendance_class_day(${id},${date}::date)`;
  if(!context)throw new ApiError("not_found");
  return context;
}

async function storedSheet(tx:Transaction,id:string){
  const [sheet]=await tx<StoredSheet[]>`select ${sheetFields(tx)} from app.attendance_sheet where id=${id}`;
  if(!sheet)throw new ApiError("not_found");
  return sheet;
}

async function roster(tx:Transaction,sheet:string) {
  return attendanceRowSchema.array().parse(await tx`
    select row_id as id,student_id as "studentId",student_number as "studentNumber",display_name as "displayName",
      enrollment_id as "enrollmentId",status,revision,locked,
      to_char(arrival_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "confirmedArrivalAt"
    from app.attendance_staff_roster(${sheet})`);
}

function sheetCounts(rows:AttendanceRow[]){
  const counts={unmarked:0,present:0,late:0,absent_unexcused:0,absent_excused:0};
  for(const row of rows)counts[row.status??"unmarked"]++;
  return counts;
}

async function view(tx:Transaction,context:ClassDay,date:string,sheet?:StoredSheet):Promise<AttendanceSheet>{
  const rows=sheet?await roster(tx,sheet.id):[];
  return attendanceSheetSchema.parse({
    id:sheet?.id??null,
    classroom:{id:context.classId,code:context.code,nameAr:context.nameAr,nameDe:context.nameDe},
    yearId:context.yearId,schoolDate:date,state:sheet?.state??"unstarted",
    teachingDay:context.teachingDay,closedReason:context.closedReason,
    canMark:context.canMark&&sheet?.state!=="approved",canApprove:context.canApprove&&sheet?.state!=="approved",
    rosterRevision:sheet?.rosterRevision??null,approvalRevision:sheet?.approvalRevision??null,approvedAt:sheet?.approvedAt??null,
    rows,counts:sheetCounts(rows),
  });
}

async function schoolDate(tx:Transaction,requested?:string){
  const [result]=await tx<{date:string|null}[]>`select coalesce(${requested??null}::date,app.school_today())::text as date`;
  if(!result?.date)throw new ApiError("unavailable");
  return result.date;
}

export function readAttendanceClasses(actor:ActorContext,requested?:string){
  return withActor(actor,async(tx)=>{
    if(actor.persona==="guardian")throw new ApiError("forbidden");
    if(actor.persona==="admin")await requireCapability(tx,actor,"attendance.supervise");
    const date=await schoolDate(tx,requested);
    const classes=await tx`select id,code,name_ar as "nameAr",name_de as "nameDe" from app.attendance_classes(${date}::date)`;
    return attendanceClasses.parse({date,classes});
  });
}

export function readPendingSheets(actor:ActorContext,input:z.infer<typeof attendancePendingQuery>){
  // Only teacher-facing workflows may query open sheets. Admin monitoring
  // receives approved attendance through its separate published-only projection.
  if(actor.persona==="admin")throw new ApiError("forbidden");
  return withActor(actor,async(tx)=>{
    await requireCapability(tx,actor,"attendance.supervise");
    const date=await schoolDate(tx,input.date);
    const items=await tx`
      select s.id,s.class_id as "classId",s.school_date::text as day,c.class_code as "classCode",
        c.class_name_ar as "nameAr",c.class_name_de as "nameDe",s.roster_revision as "rosterRevision",s.approval_revision as "approvalRevision"
      from app.attendance_sheet s cross join lateral app.attendance_class_day(s.class_id,s.school_date) c
      where s.state='open' and s.school_date=${date}::date and c.can_approve
        and (${input.cursor??null}::uuid is null or s.id>${input.cursor??null}::uuid)
      order by s.id limit ${input.limit+1}`;
    const found=attendancePendingSchema.parse({date,items});
    return {page:{date,items:found.items.slice(0,input.limit)},
      nextCursor:found.items.length>input.limit?found.items[input.limit-1].id:undefined};
  });
}

export function readDailySheet(actor:ActorContext,id:string,date:string){
  return withActor(actor,async(tx)=>{
    const context=await classDay(tx,id,date);
    const [sheet]=await tx<StoredSheet[]>`
      select ${sheetFields(tx)} from app.attendance_sheet where class_id=${id} and school_date=${date}::date`;
    if(actor.persona==="admin"){
      await requireCapability(tx,actor,"attendance.supervise");
      if(sheet?.state!=="approved")throw new ApiError("forbidden");
    }
    return view(tx,context,date,sheet);
  });
}

async function allow(tx:Transaction,id:string,date:string,operation:Operation){
  const [result]=await tx<{allowed:boolean}[]>`select app.attendance_scope(${id},${date}::date,${operation}) as allowed`;
  return result.allowed;
}

export function openDailySheet(actor:ActorContext,id:string,date:string,key:string|null){
  return commitCommand(actor,"attendance.sheet.open",key,hashCommand({id,date}),{
    authorize:async(tx)=>{
      await classDay(tx,id,date);
      if(!await allow(tx,id,date,"attendance.mark")&&!await allow(tx,id,date,"attendance.approve"))throw new ApiError("forbidden");
    },
    mutate:async(tx)=>{
      await tx`select app.lock_school_calendar()`;
      const context=await classDay(tx,id,date);
      if(!context.canMark&&!context.canApprove)throw new ApiError("closed_day");
      const [opened]=await tx<{id:string;created:boolean}[]>`
        select sheet_id as id,created from app.open_attendance_day(${id},${date}::date)`;
      if(opened.created)await appendAudit(tx,{action:"attendance.sheet_opened",aggregateId:opened.id});
      return view(tx,context,date,await storedSheet(tx,opened.id));
    },
  });
}

async function authorizeSheet(tx:Transaction,id:string,operation:Operation){
  const sheet=await storedSheet(tx,id);
  if(!await allow(tx,sheet.classId,sheet.schoolDate,operation))throw new ApiError("forbidden");
}
async function lockOpenSheet(tx:Transaction,id:string,operation:Operation){
  await tx`select app.lock_school_calendar()`;
  const current=await storedSheet(tx,id);
  if(current.state!=="open")throw new ApiError("conflict");
  const context=await classDay(tx,current.classId,current.schoolDate);
  const permitted=operation==="attendance.mark"?context.canMark:context.canApprove;
  if(!permitted){
    if(!await allow(tx,current.classId,current.schoolDate,operation))throw new ApiError("forbidden");
    throw new ApiError("closed_day");
  }
  await tx`select app.lock_attendance_sheet(${id},${operation})`;
  return {context,sheet:await storedSheet(tx,id)};
}

function rowConflict(row:AttendanceRow|undefined,edit:Mark):AttendanceChanges["conflicts"][number]["reason"]|null {
  if(!row)return "outside_roster";
  if(row.locked)return "locked";
  if(row.confirmedArrivalAt)return "arrival_confirmed";
  if(row.revision!==edit.revision)return "stale";
  return null;
}

function saveMarks(actor:ActorContext,id:string,key:string|null,edits:Mark[],bulk:boolean){
  const ordered=[...edits].sort((a,b)=>a.rowId.localeCompare(b.rowId));
  return commitCommand(actor,bulk?"attendance.sheet.mark_present":"attendance.sheet.edit_rows",key,hashCommand({id,edits:ordered}),{
    authorize:(tx)=>authorizeSheet(tx,id,"attendance.mark"),
    mutate:async(tx)=>{
      await lockOpenSheet(tx,id,"attendance.mark");
      const rows=new Map((await roster(tx,id)).map((row)=>[row.id,row]));
      const outcome:AttendanceChanges={applied:[],skippedLocked:[],conflicts:[]};
      for(const edit of ordered){
        const row=rows.get(edit.rowId);
        const reason=rowConflict(row,edit);
        if(reason==="locked"&&bulk&&row){
          outcome.skippedLocked.push(row);
          continue;
        }
        if(!row || reason){
          outcome.conflicts.push({rowId:edit.rowId,reason:reason??"outside_roster",current:row??null});
          continue;
        }
        if(row.status===edit.status){
          outcome.applied.push(row);
          continue;
        }
        const [saved]=await tx<{revision:number}[]>`
          update app.attendance_row set status=${edit.status}::app.attendance_status,revision=revision+1
          where id=${row.id} and sheet_id=${id} and revision=${edit.revision} and lock_source is null and confirmed_arrival_at is null
          returning revision`;
        if(!saved)throw new ApiError("stale_revision");
        outcome.applied.push({...row,status:edit.status,revision:saved.revision});
      }
      return attendanceChanges.parse(outcome);
    },
  });
}
export function editAttendanceRows(actor:ActorContext,id:string,key:string|null,input:z.infer<typeof attendanceEditInput>){
  return saveMarks(actor,id,key,input.edits,false);
}
export function bulkPresent(actor:ActorContext,id:string,key:string|null,input:z.infer<typeof attendanceBulkInput>){
  return saveMarks(actor,id,key,input.rows.map((row)=>({...row,status:"present"})),true);
}

export function approveAttendance(actor:ActorContext,id:string,key:string|null,input:z.infer<typeof attendanceApproveInput>){
  const expectedRows=[...input.expectedRows].sort((a,b)=>a.rowId.localeCompare(b.rowId));
  return commitCommand(actor,"attendance.sheet.approve",key,hashCommand({id,approvalRevision:input.approvalRevision,expectedRows}),{
    authorize:(tx)=>authorizeSheet(tx,id,"attendance.approve"),
    mutate:async(tx)=>{
      const {context,sheet}=await lockOpenSheet(tx,id,"attendance.approve");
      requireRevision(sheet.approvalRevision,input.approvalRevision);
      const rows=await roster(tx,id);
      const expected=new Map(expectedRows.map(({rowId,revision})=>[rowId,revision]));
      if(rows.length!==expectedRows.length||rows.some((row)=>expected.get(row.id)!==row.revision))throw new ApiError("stale_revision");
      if(rows.some((row)=>row.status===null))throw new ApiError("attendance_incomplete");
      await tx`update app.attendance_sheet set state='approved',approval_revision=approval_revision+1,
        approved_at=now(),approved_by=app.actor_account() where id=${id}`;
      await appendAudit(tx,{action:"attendance.sheet_approved",aggregateId:id});
      for(const row of rows){
        if(row.status!=="absent_unexcused")continue;
        const event=await appendEvent(tx,{type:"attendance.unexcused_confirmed",aggregateId:row.id,actorId:actor.accountId,
          payload:{sheetId:id,classId:sheet.classId,studentId:row.studentId,schoolDate:sheet.schoolDate,revision:row.revision,
            approvalRevision:sheet.approvalRevision+1}});
        await tx`select app.attach_attendance_approved_event(${row.id},${row.revision},${event})`;
      }
      return view(tx,context,sheet.schoolDate,await storedSheet(tx,id));
    },
  });
}
