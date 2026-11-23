import "server-only";
import {
  activityEntry,activityHistoryRow,activityMarkReceipt,activityRosterRow,lessonReceipt,
  schoolDateSchema,teachingAssignmentChoice,teachingEntry,
  type activityCreate,type activityMarkInput,type activityQuery,type activityRosterQuery,
  type teachingLogChange,type teachingLogCreate,type teachingLogQuery,
} from "@madrasty/contracts";
import { z } from "zod";
import { withActor,type ActorContext,type Transaction } from "@/server/db/scoped";
import { commitCommand,hashCommand } from "@/server/db/commands";
import { appendAudit,appendEvent } from "@/server/db/outbox";
import { ApiError } from "@/server/http";
import { academicReadScope } from "./curriculum";

const datedCursor=z.object({date:schoolDateSchema,id:z.uuid()});
type DatedEntry={date:string;id:string};
function cursorValue(value?:string){
  if(!value)return null;
  try{
    if(!/^[A-Za-z0-9_-]{1,200}$/.test(value))throw new Error("cursor");
    return datedCursor.parse(JSON.parse(Buffer.from(value,"base64url").toString("utf8")));
  }catch{throw new ApiError("validation",{cursor:"error.validation"});}
}
function datedPage<T>(rows:T[],limit:number,dates:(row:T)=>DatedEntry){
  const items=rows.slice(0,limit);
  const last=items.at(-1);
  return {items,nextCursor:rows.length>limit&&last?Buffer.from(JSON.stringify(dates(last))).toString("base64url"):undefined};
}

async function staffRead(tx:Transaction,actor:ActorContext){
  if(actor.persona==="guardian")throw new ApiError("forbidden");
  await academicReadScope(tx,actor);
}
async function offeringScope(tx:Transaction,actor:ActorContext,offering:string,date:string,operation:"academics.log"|"academics.grade"){
  await staffRead(tx,actor);
  const [result]=await tx<{allowed:boolean}[]>`select app.academic_offering_scope(${offering},${date}::date,${operation}) as allowed`;
  if(!result.allowed)throw new ApiError("not_found");
}

const teachingFields=(tx:Transaction)=>tx`id,offering_id as "offeringId",assignment_id as "assignmentId",lesson_id as "lessonId",
  lesson_version_id as "lessonVersionId",actual_date::text as "actualDate",delivered_notes as "deliveredNotes",
  to_char(recorded_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "recordedAt",recorded_by_name as "recordedByName",
  revision,can_edit as "canEdit",planned_date::text as "plannedDate",plan_title_ar as "planTitleAr",plan_title_de as "planTitleDe"`;
export function teachingLog(actor:ActorContext,query:z.infer<typeof teachingLogQuery>){
  return withActor(actor,async(tx)=>{
    await staffRead(tx,actor);
    const after=cursorValue(query.cursor);
    const rows=teachingEntry.array().parse(await tx`
      select ${teachingFields(tx)} from app.teaching_log_rows(${query.offeringId??null}::uuid,null)
      where (${after?.id??null}::uuid is null or (actual_date,id)<(${after?.date??null}::date,${after?.id??null}::uuid))
      order by actual_date desc,id desc limit ${query.limit+1}`);
    return datedPage(rows,query.limit,(row)=>({date:row.actualDate,id:row.id}));
  });
}
async function teachingRecord(tx:Transaction,id:string){
  const [item]=await tx`select ${teachingFields(tx)} from app.teaching_log_rows(null,${id})`;
  if(!item)throw new ApiError("not_found");
  return teachingEntry.parse(item);
}
export function teachingById(actor:ActorContext,id:string){
  return withActor(actor,async(tx)=>{await staffRead(tx,actor);return teachingRecord(tx,id);});
}
export function teachingAssignments(actor:ActorContext,offering:string,date:string){
  return withActor(actor,async(tx)=>{
    await offeringScope(tx,actor,offering,date,"academics.log");
    return teachingAssignmentChoice.array().parse(await tx`
      select id,teacher_name as "teacherName" from app.academic_staff_assignments(${offering},${date}::date) order by teacher_name,id`);
  });
}
export function updateTeachingLog(actor:ActorContext,key:string|null,input:z.infer<typeof teachingLogCreate>|z.infer<typeof teachingLogChange>,id?:string){
  if(actor.persona!=="teacher")throw new ApiError("forbidden");
  const offeringId="offeringId" in input?input.offeringId:null;
  const revision="revision" in input?input.revision:null;
  return commitCommand(actor,id?"academics.teaching.change":"academics.teaching.create",key,hashCommand({id:id??null,...input}),{
    authorize:async(tx)=>{
      if(id){
        await staffRead(tx,actor);
        const [item]=await tx`select id from app.teaching_log_rows(null,${id})`;
        if(!item)throw new ApiError("not_found");
      }else if(offeringId)await offeringScope(tx,actor,offeringId,input.actualDate,"academics.log");
    },
    mutate:async(tx)=>{
      const [row]=await tx`select id,revision from app.write_teaching_log(${id??null}::uuid,${offeringId}::uuid,
        ${input.assignmentId??null}::uuid,${input.actualDate}::date,${input.deliveredNotes},${input.lessonId??null}::uuid,
        ${input.lessonVersionId??null}::uuid,${revision}::integer)`;
      if(!row)throw new ApiError("stale_revision");
      const value=lessonReceipt.parse(row);
      await appendAudit(tx,{action:id?"academics.teaching_updated":"academics.teaching_logged",aggregateId:value.id});
      return value;
    },
  });
}

const activityFields=(tx:Transaction)=>tx`id,offering_id as "offeringId",activity_date::text as date,title,max_score::float8 as "maxScore",
  score::float8 as score,mark_id as "markId",mark_revision as "markRevision",class_id as "classId",class_code as "classCode",
  subject_name_ar as "subjectNameAr",subject_name_de as "subjectNameDe",can_edit as "canEdit"`;
async function activityRecord(tx:Transaction,id:string,child?:string){
  const [row]=await tx`select ${activityFields(tx)} from app.assessed_activity_rows(${child??null}::uuid,null,${id})`;
  if(!row)throw new ApiError("not_found");
  return activityEntry.parse(row);
}
export function activityById(actor:ActorContext,id:string,child?:string){
  return withActor(actor,async(tx)=>{await academicReadScope(tx,actor,child);return activityRecord(tx,id,child);});
}
export function activities(actor:ActorContext,query:z.infer<typeof activityQuery>){
  return withActor(actor,async(tx)=>{
    await academicReadScope(tx,actor,query.childId);
    const after=cursorValue(query.cursor);
    const rows=activityEntry.array().parse(await tx`select ${activityFields(tx)}
      from app.assessed_activity_rows(${query.childId??null}::uuid,${query.offeringId??null}::uuid,null)
      where (${after?.id??null}::uuid is null or (activity_date,id)<(${after?.date??null}::date,${after?.id??null}::uuid))
      order by activity_date desc,id desc limit ${query.limit+1}`);
    return datedPage(rows,query.limit,(row)=>({date:row.date,id:row.id}));
  });
}
export function createActivity(actor:ActorContext,key:string|null,input:z.infer<typeof activityCreate>){
  if(actor.persona!=="teacher")throw new ApiError("forbidden");
  return commitCommand(actor,"academics.activity.create",key,hashCommand(input),{
    authorize:(tx)=>offeringScope(tx,actor,input.offeringId,input.date,"academics.grade"),
    mutate:async(tx)=>{
      const [created]=await tx<{id:string}[]>`select app.new_assessed_activity(${input.offeringId},${input.date}::date,
        ${input.title},${String(input.maxScore)}::numeric) as id`;
      await appendAudit(tx,{action:"academics.activity_created",aggregateId:created.id});
      return activityRecord(tx,created.id);
    },
  });
}
export function activityRoster(actor:ActorContext,id:string,query:z.infer<typeof activityRosterQuery>){
  if(actor.persona==="admin")throw new ApiError("forbidden");
  return withActor(actor,async(tx)=>{
    await staffRead(tx,actor);
    await activityRecord(tx,id);
    const rows=activityRosterRow.array().parse(await tx`
      select student_id as "studentId",student_name as "studentName",student_number as "studentNumber",enrollment_id as "enrollmentId",
        score::float8 as score,mark_id as "markId",revision,visible from app.assessed_activity_roster(${id})
      where (${query.cursor??null}::uuid is null or student_id>${query.cursor??null}::uuid)
      order by student_id limit ${query.limit+1}`);
    return {items:rows.slice(0,query.limit),nextCursor:rows.length>query.limit?rows[query.limit-1].studentId:undefined};
  });
}
async function rosterPupil(tx:Transaction,activity:string,student:string){
  const [row]=await tx`select 1 from app.assessed_activity_roster(${activity}) where student_id=${student}`;
  if(!row)throw new ApiError("not_found");
}
export function activityHistory(actor:ActorContext,id:string,student:string){
  if(actor.persona==="admin")throw new ApiError("forbidden");
  return withActor(actor,async(tx)=>{
    await staffRead(tx,actor);
    await rosterPupil(tx,id,student);
    return activityHistoryRow.array().parse(await tx`select revision,previous_score::float8 as "previousScore",score::float8 as score,
      actor_name as "actorName",to_char(occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "occurredAt",reason
      from app.activity_correction_rows(${id},${student}) order by revision desc`);
  });
}
export function setActivityMark(actor:ActorContext,id:string,student:string,key:string|null,input:z.infer<typeof activityMarkInput>){
  if(actor.persona!=="teacher")throw new ApiError("forbidden");
  return commitCommand(actor,"academics.activity.mark",key,hashCommand({id,student,...input}),{
    authorize:async(tx)=>{await staffRead(tx,actor);await rosterPupil(tx,id,student);},
    mutate:async(tx)=>{
      const activity=await activityRecord(tx,id);
      if(input.score!==null&&input.score>activity.maxScore)throw new ApiError("validation",{score:"error.validation"});
      const [row]=await tx`select mark_id as "markId",score::float8 as score,revision,changed,correction
        from app.write_activity_mark(${id},${student},${input.revision},${input.score===null?null:String(input.score)}::numeric,
          ${input.reasonIfCorrection??null}::text)`;
      if(!row)throw new ApiError("stale_revision");
      const result=activityMarkReceipt.parse(row);
      if(result.changed&&result.markId){
        await appendAudit(tx,{action:result.correction?"academics.activity_corrected":"academics.activity_scored",aggregateId:result.markId});
        if(result.correction)await appendEvent(tx,{
          type:"result.published",aggregateId:result.markId,actorId:actor.accountId,
          payload:{sourceKind:"activity",sourceId:id,studentId:student,classId:activity.classId,date:activity.date,revision:result.revision,change:"correction"},
        });
      }
      return result;
    },
  });
}
