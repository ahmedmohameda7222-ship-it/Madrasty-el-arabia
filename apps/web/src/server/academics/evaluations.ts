import "server-only";
import {
  assessmentPupil,evaluationEntry,evaluationPublication,evaluationPublicationReceipt,lessonReceipt,schoolDateSchema,
  type assessmentRosterQuery,type evaluationChange,type evaluationCorrect,type evaluationCreate,type evaluationListQuery,
} from "@madrasty/contracts";
import { z } from "zod";
import { commitCommand,hashCommand } from "@/server/db/commands";
import { appendAudit,appendEvent } from "@/server/db/outbox";
import { withActor,type ActorContext,type Transaction } from "@/server/db/scoped";
import { ApiError } from "@/server/http";
import { academicReadScope } from "./curriculum";

const cursorSchema=z.object({periodEnd:schoolDateSchema,id:z.uuid()});
function cursorFrom(value?:string){
  if(!value)return null;
  try{
    if(!/^[A-Za-z0-9_-]{1,180}$/.test(value))throw new Error("cursor");
    return cursorSchema.parse(JSON.parse(Buffer.from(value,"base64url").toString("utf8")));
  }catch{throw new ApiError("validation",{cursor:"error.validation"});}
}
const fields=(tx:Transaction)=>tx`id,student_id as "studentId",student_name as "studentName",student_number as "studentNumber",
  offering_id as "offeringId",class_id as "classId",class_code as "classCode",class_name_ar as "classNameAr",class_name_de as "classNameDe",
  year_id as "yearId",year_start::text as "yearStart",year_end::text as "yearEnd",subject_id as "subjectId",
  subject_name_ar as "subjectNameAr",subject_name_de as "subjectNameDe",period_start::text as "periodStart",period_end::text as "periodEnd",
  title,participation,understanding,preparation,strengths,improvements,revision,published_id as "publishedId",published_revision as "publishedRevision",
  to_char(published_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "publishedAt",can_edit as "canEdit",
  can_publish as "canPublish",has_corrections as "hasCorrections"`;

async function staff(tx:Transaction,actor:ActorContext){
  if(actor.persona!=="teacher")throw new ApiError("forbidden");
  await academicReadScope(tx,actor);
}

async function record(tx:Transaction,id:string,child?:string){
  const [row]=await tx`select ${fields(tx)} from app.evaluation_projection(${child??null}::uuid,null,null,${id})`;
  if(!row)throw new ApiError("not_found");
  return evaluationEntry.parse(row);
}
export function readEvaluation(actor:ActorContext,id:string,child?:string){
  if(actor.persona==="admin")throw new ApiError("forbidden");
  return withActor(actor,async(tx)=>{
    await academicReadScope(tx,actor,child);
    return record(tx,id,child);
  });
}
export function listEvaluations(actor:ActorContext,input:z.infer<typeof evaluationListQuery>){
  if(actor.persona==="admin")throw new ApiError("forbidden");
  return withActor(actor,async(tx)=>{
    await academicReadScope(tx,actor,input.childId);
    const cursor=cursorFrom(input.cursor);
    const rows=evaluationEntry.array().parse(await tx`select ${fields(tx)}
      from app.evaluation_projection(${input.childId??null}::uuid,${input.offeringId??null}::uuid,${input.classId??null}::uuid,null)
      where (${cursor?.id??null}::uuid is null or (period_end,id)<(${cursor?.periodEnd??null}::date,${cursor?.id??null}::uuid))
      order by period_end desc,id desc limit ${input.limit+1}`);
    const items=rows.slice(0,input.limit),last=items.at(-1);
    return {items,nextCursor:rows.length>input.limit&&last
      ?Buffer.from(JSON.stringify({periodEnd:last.periodEnd,id:last.id})).toString("base64url"):undefined};
  });
}

async function evaluateScope(tx:Transaction,actor:ActorContext,offering:string,date:string,operation:"academics.grade"|"academics.publish"|null){
  await staff(tx,actor);
  const [scope]=await tx<{allowed:boolean}[]>`
    select app.evaluation_staff_scope(${offering},${date}::date,${operation}::text) as allowed`;
  if(!scope.allowed)throw new ApiError("not_found");
}
export function assessmentRoster(actor:ActorContext,input:z.infer<typeof assessmentRosterQuery>){
  return withActor(actor,async(tx)=>{
    await evaluateScope(tx,actor,input.offeringId,input.date,null);
    const rows=assessmentPupil.array().parse(await tx`
      select student_id as "studentId",enrollment_id as "enrollmentId",student_name as "studentName",student_number as "studentNumber"
      from app.assessment_pupil_options(${input.offeringId},${input.date}::date)
      where (${input.cursor??null}::uuid is null or student_id>${input.cursor??null}::uuid)
      order by student_id limit ${input.limit+1}`);
    return {items:rows.slice(0,input.limit),nextCursor:rows.length>input.limit?rows[input.limit-1].studentId:undefined};
  });
}
export function readEvaluationHistory(actor:ActorContext,id:string){
  return withActor(actor,async(tx)=>{
    await staff(tx,actor);
    await record(tx,id);
    return evaluationPublication.array().parse(await tx`select id,revision,title,participation,understanding,preparation,
      strengths,improvements,actor_name as "actorName",
      to_char(published_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "publishedAt",reason
      from app.evaluation_publication_history(${id}) order by revision desc`);
  });
}
export function writeEvaluation(actor:ActorContext,key:string|null,input:z.infer<typeof evaluationCreate>|z.infer<typeof evaluationChange>,id?:string){
  const offeringId="offeringId" in input?input.offeringId:null;
  const studentId="studentId" in input?input.studentId:null;
  const revision="revision" in input?input.revision:null;
  return commitCommand(actor,id?"academics.evaluation.change":"academics.evaluation.create",key,hashCommand({id:id??null,...input}),{
    authorize:async(tx)=>{
      await staff(tx,actor);
      if(id){
        const previous=await record(tx,id);
        await evaluateScope(tx,actor,previous.offeringId,previous.periodEnd,"academics.grade");
      }else if(offeringId)await evaluateScope(tx,actor,offeringId,input.periodEnd,"academics.grade");
    },
    mutate:async(tx)=>{
      const [row]=await tx`select id,revision from app.write_evaluation_draft(
        ${id??null}::uuid,${offeringId}::uuid,${studentId}::uuid,${input.periodStart}::date,${input.periodEnd}::date,
        ${input.title},${input.participation}::integer,${input.understanding}::integer,${input.preparation}::integer,
        ${input.strengths},${input.improvements},${revision}::integer)`;
      if(!row)throw new ApiError("stale_revision");
      const result=lessonReceipt.parse(row);
      await appendAudit(tx,{action:id?"academics.evaluation_updated":"academics.evaluation_created",aggregateId:result.id});
      return result;
    },
  });
}
type Publication=z.infer<typeof evaluationPublicationReceipt>&{studentId:string;classId:string;date:string;change:"initial"|"correction"};
export function publishEvaluation(actor:ActorContext,id:string,key:string|null,revision:number,changes?:z.infer<typeof evaluationCorrect>){
  return commitCommand(actor,changes?"academics.evaluation.correct":"academics.evaluation.publish",key,hashCommand({id,revision,changes:changes??null}),{
    authorize:async(tx)=>{
      await staff(tx,actor);
      const row=await record(tx,id);
      await evaluateScope(tx,actor,row.offeringId,row.periodEnd,"academics.publish");
    },
    mutate:async(tx)=>{
      const [value]=await tx<Publication[]>`select publication_id as "publicationId",revision,
        to_char(published_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "publishedAt",student_id as "studentId",
        class_id as "classId",school_date::text as date,change_kind as change from app.publish_evaluation(
          ${id},${revision},${changes?tx.json(changes.changes):null}::jsonb,${changes?.reason??null}::text)`;
      if(!value)throw new ApiError("stale_revision");
      await appendAudit(tx,{action:changes?"academics.evaluation_corrected":"academics.evaluation_published",aggregateId:id,metadata:{revision:value.revision}});
      await appendEvent(tx,{type:"result.published",aggregateId:id,actorId:actor.accountId,payload:{
        sourceKind:"evaluation",sourceId:id,studentId:value.studentId,classId:value.classId,date:value.date,
        revision:value.revision,change:value.change,batchId:value.publicationId,publicationId:value.publicationId,
      }});
      return evaluationPublicationReceipt.parse(value);
    },
  });
}
