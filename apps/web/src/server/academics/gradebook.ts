import "server-only";
import {
  homeworkGradeBulkReceipt,homeworkGradeCorrection,homeworkGradeReceipt,homeworkGradeRow,homeworkGradingItem,
  type gradingInboxQuery,type homeworkGradeBulkInput,type homeworkGradeInput,type homeworkGradeRosterQuery,
} from "@madrasty/contracts";
import type { JSONValue } from "postgres";
import { z } from "zod";
import { commitCommand,hashCommand } from "@/server/db/commands";
import { appendAudits,appendEvents } from "@/server/db/outbox";
import { withActor,type ActorContext,type Transaction } from "@/server/db/scoped";
import { ApiError } from "@/server/http";
import { academicReadScope } from "./curriculum";
import { homeworkRecord } from "./homework";
import { readDecimalJson } from "./decimal-json";

const cursorSchema=z.object({dueOn:z.iso.date(),id:z.uuid()});
function inboxCursor(value?:string){
  if(!value)return null;
  try{
    if(!/^[A-Za-z0-9_-]{1,180}$/.test(value))throw new Error("cursor");
    return cursorSchema.parse(JSON.parse(Buffer.from(value,"base64url").toString("utf8")));
  }catch{throw new ApiError("validation",{cursor:"error.validation"});}
}

export function readHomeworkGrades<T>(request:Request,schema:z.ZodType<T>){
  return readDecimalJson(request,schema,['score'],3*1024*1024);
}

async function staff(tx:Transaction,actor:ActorContext){
  if(actor.persona!=="teacher")throw new ApiError("forbidden");
  await academicReadScope(tx,actor);
}

async function canAccessGradebook(tx:Transaction,actor:ActorContext,id:string){
  await staff(tx,actor);
  const homework=await homeworkRecord(tx,id);
  const [scope]=await tx<{allowed:boolean}[]>`select app.homework_staff_scope(
    ${homework.offeringId},${homework.issuedOn}::date,'academics.grade') as allowed`;
  if(!scope.allowed)throw new ApiError("not_found");
  return homework;
}

export function gradingInbox(actor:ActorContext,input:z.infer<typeof gradingInboxQuery>){
  return withActor(actor,async(tx)=>{
    await staff(tx,actor);
    const cursor=inboxCursor(input.cursor);
    const rows=homeworkGradingItem.array().parse(await tx`select homework_id as "homeworkId",offering_id as "offeringId",
      class_id as "classId",class_code as "classCode",subject_name_ar as "subjectNameAr",subject_name_de as "subjectNameDe",
      title,issued_on::text as "issuedOn",due_on::text as "dueOn",graded,total,can_edit as "canEdit"
      from app.homework_grade_inbox(${input.classId??null}::uuid)
      where (${cursor?.id??null}::uuid is null or (due_on,homework_id)<(${cursor?.dueOn??null}::date,${cursor?.id??null}::uuid))
      order by due_on desc,homework_id desc limit ${input.limit+1}`);
    const items=rows.slice(0,input.limit),last=items.at(-1);
    return {items,nextCursor:rows.length>input.limit&&last
      ?Buffer.from(JSON.stringify({dueOn:last.dueOn,id:last.homeworkId})).toString("base64url"):undefined};
  });
}

export function gradingRoster(actor:ActorContext,id:string,input:z.infer<typeof homeworkGradeRosterQuery>){
  return withActor(actor,async(tx)=>{
    await canAccessGradebook(tx,actor,id);
    const rows=homeworkGradeRow.array().parse(await tx`select roster_id as "rosterId",student_id as "studentId",
      student_name as "studentName",student_number as "studentNumber",joined_on::text as "joinedOn",added_later as "addedLater",
      score::float8 as score,feedback,revision,visible,can_edit as "canEdit",corrected
      from app.homework_grade_rows(${id}) where (${input.cursor??null}::uuid is null or student_id>${input.cursor??null}::uuid)
      order by student_id limit ${input.limit+1}`);
    return {items:rows.slice(0,input.limit),nextCursor:rows.length>input.limit?rows[input.limit-1].studentId:undefined};
  });
}

export function gradeHistory(actor:ActorContext,id:string,pupil:string){
  return withActor(actor,async(tx)=>{
    await canAccessGradebook(tx,actor,id);
    const [allowed]=await tx`select 1 from app.homework_grade_rows(${id}) where student_id=${pupil}`;
    if(!allowed)throw new ApiError("not_found");
    return homeworkGradeCorrection.array().parse(await tx`select revision,previous_score::float8 as "previousScore",score::float8 as score,
      previous_feedback as "previousFeedback",feedback,actor_name as "actorName",
      to_char(occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "occurredAt",reason
      from app.homework_grade_history(${id},${pupil}) order by revision desc`);
  });
}

type Inputs=z.infer<typeof homeworkGradeInput>&{studentId:string};
type Outcome={studentId:string;rosterId:string|null;revision:number|null;outcome:string;correction:boolean};

function gradeWire(row:Inputs){
  return {
    studentId:row.studentId,revision:row.revision,
    ...(row.score!==undefined?{score:row.score}:{}),
    ...(row.feedback!==undefined?{feedback:row.feedback}:{}),
    ...(row.reasonIfCorrection!==undefined?{reasonIfCorrection:row.reasonIfCorrection}:{}),
  };
}

function writeGrades(actor:ActorContext,id:string,key:string|null,rows:Inputs[],bulk:boolean){
  const reviewed=rows.map(gradeWire);
  return commitCommand(actor,bulk?"academics.homework.grade_bulk":"academics.homework.grade_one",key,hashCommand({id,reviewed}),{
    authorize:async(tx)=>{await canAccessGradebook(tx,actor,id);},
    mutate:async(tx)=>{
      const homework=await canAccessGradebook(tx,actor,id);
      const result=await tx<Outcome[]>`select student_id as "studentId",roster_id as "rosterId",revision,outcome,correction
        from app.write_homework_grades(${id},${tx.json(reviewed as JSONValue)})`;
      const failures=result.filter((row)=>row.outcome!=="committed"&&row.outcome!=="unchanged");
      if(failures.length){
        const bad=failures.some((row)=>row.outcome!=="stale");
        if(!bulk&&failures[0].outcome==="unavailable")throw new ApiError("not_found");
        throw new ApiError(bad?"validation":"stale_revision",Object.fromEntries(failures.map((row)=>[
          bulk?`rows.${row.studentId}`:row.outcome==="reason"?"reasonIfCorrection":row.outcome,
          row.outcome==="stale"?"error.staleRevision":"error.validation",
        ])));
      }
      const saved=result.map((row)=>homeworkGradeReceipt.parse({...row,changed:row.outcome==="committed"}));
      const changed=saved.filter((row)=>row.changed);
      await appendAudits(tx,changed.map((row)=>({
        action:row.correction?"academics.homework_corrected":"academics.homework_scored",aggregateId:row.rosterId,
      })));
      await appendEvents(tx,changed.filter((row)=>row.correction).map((row)=>({
        type:"result.published",aggregateId:row.rosterId,actorId:actor.accountId,
        payload:{sourceKind:"homework",sourceId:id,studentId:row.studentId,classId:homework.classId,date:homework.issuedOn,
          revision:row.revision,change:"correction"},
      })));
      const [summary]=await tx<{graded:number;total:number}[]>`select count(*) filter(where score is not null)::int as graded,
        count(*)::int as total from app.homework_grade_rows(${id})`;
      return homeworkGradeBulkReceipt.parse({rows:saved,changedCount:changed.length,...summary});
    },
  });
}

export function saveOneHomeworkGrade(actor:ActorContext,id:string,studentId:string,key:string|null,input:z.infer<typeof homeworkGradeInput>){
  return writeGrades(actor,id,key,[{studentId,...input}],false).then(({data})=>data.rows[0]);
}
export function saveBulkHomeworkGrades(actor:ActorContext,id:string,key:string|null,input:z.infer<typeof homeworkGradeBulkInput>){
  return writeGrades(actor,id,key,input.rows,true).then(({data})=>data);
}
