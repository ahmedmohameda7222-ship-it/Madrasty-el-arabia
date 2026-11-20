import "server-only";
import {
  examAnnouncementReceipt,examEntry,examMarkReceipt,examResultBatchReceipt,examResultCorrectionReceipt,
  examResultHistory,examRosterRow,lessonReceipt,schoolDateSchema,
  type examAnnounce,type examChange,type examCreate,type examListQuery,type examMarkInput,
  type examResultCorrect,type examResultPublish,type examRosterQuery,
} from "@madrasty/contracts";
import { z } from "zod";
import { commitCommand,hashCommand } from "@/server/db/commands";
import { appendAudit,appendEvent,appendEvents } from "@/server/db/outbox";
import { withActor,type ActorContext,type Transaction } from "@/server/db/scoped";
import { ApiError } from "@/server/http";
import { academicReadScope } from "./curriculum";

const position=z.object({date:schoolDateSchema,id:z.uuid()});
function cursorFrom(value?:string){
  if(!value)return null;
  try{
    if(!/^[A-Za-z0-9_-]{1,180}$/.test(value))throw new Error("cursor");
    return position.parse(JSON.parse(Buffer.from(value,"base64url").toString("utf8")));
  }catch{throw new ApiError("validation",{cursor:"error.validation"});}
}
const fields=(tx:Transaction)=>tx`id,offering_id as "offeringId",class_id as "classId",class_code as "classCode",
  class_name_ar as "classNameAr",class_name_de as "classNameDe",year_id as "yearId",year_start::text as "yearStart",year_end::text as "yearEnd",
  subject_id as "subjectId",subject_name_ar as "subjectNameAr",subject_name_de as "subjectNameDe",exam_date::text as date,
  left(exam_time::text,5) as time,exam_kind as kind,title,max_score::float8 as "maxScore",revision,
  announcement_id as "announcementId",announcement_revision as "announcementRevision",announced_date::text as "announcedDate",
  left(announced_time::text,5) as "announcedTime",to_char(announced_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "announcedAt",
  announcement_pending as "announcementPending",result_id as "resultId",result_revision as "resultRevision",result_exam_date::text as "resultDate",
  result_score::float8 as "resultScore",result_max_score::float8 as "resultMaxScore",result_feedback as "resultFeedback",
  to_char(result_published_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "resultPublishedAt",
  can_edit as "canEdit",can_announce as "canAnnounce",can_review as "canReview",can_mark as "canMark",can_publish as "canPublish"`;
async function examRecord(tx:Transaction,id:string,child?:string){
  const [raw]=await tx`select ${fields(tx)} from app.exam_projection(${child??null}::uuid,null,null,${id})`;
  if(!raw)throw new ApiError("not_found");
  return examEntry.parse(raw);
}
export function loadExam(actor:ActorContext,id:string,child?:string){
  return withActor(actor,async(tx)=>{
    await academicReadScope(tx,actor,child);
    return examRecord(tx,id,child);
  });
}
export function listExams(actor:ActorContext,input:z.infer<typeof examListQuery>){
  return withActor(actor,async(tx)=>{
    await academicReadScope(tx,actor,input.childId);
    const cursor=cursorFrom(input.cursor);
    const rows=examEntry.array().parse(await tx`select ${fields(tx)} from app.exam_projection(
      ${input.childId??null}::uuid,${input.offeringId??null}::uuid,${input.classId??null}::uuid,null)
      where (${cursor?.id??null}::uuid is null or (exam_date,id)<(${cursor?.date??null}::date,${cursor?.id??null}::uuid))
      order by exam_date desc,id desc limit ${input.limit+1}`);
    const items=rows.slice(0,input.limit),last=items.at(-1);
    return {items,nextCursor:rows.length>input.limit&&last
      ?Buffer.from(JSON.stringify({date:last.date,id:last.id})).toString("base64url"):undefined};
  });
}
async function staff(tx:Transaction,actor:ActorContext){
  if(actor.persona==="guardian")throw new ApiError("forbidden");
  await academicReadScope(tx,actor);
}
async function scope(tx:Transaction,offering:string,date:string,operation:"academics.plan"|"academics.grade"|"academics.publish"){
  const [allowed]=await tx<{ok:boolean}[]>`select app.exam_scope(${offering},${date}::date,${operation}) as ok`;
  if(!allowed.ok)throw new ApiError("not_found");
}
export function saveExam(actor:ActorContext,key:string|null,input:z.infer<typeof examCreate>|z.infer<typeof examChange>,id?:string){
  const offering="offeringId" in input?input.offeringId:null;
  const revision="revision" in input?input.revision:null;
  return commitCommand(actor,id?"academics.exam.change":"academics.exam.create",key,hashCommand({id:id??null,...input}),{
    authorize:async(tx)=>{
      await staff(tx,actor);
      if(id){
        const old=await examRecord(tx,id);
        await scope(tx,old.offeringId,old.date,"academics.plan");
      }else if(offering)await scope(tx,offering,input.date,"academics.plan");
    },
    mutate:async(tx)=>{
      const [raw]=await tx`select id,revision from app.write_exam(${id??null}::uuid,${offering}::uuid,${input.date}::date,
        ${input.time}::time,${input.kind},${input.title},${String(input.maxScore)}::numeric,${revision}::integer)`;
      if(!raw)throw new ApiError("stale_revision");
      const receipt=lessonReceipt.parse(raw);
      await appendAudit(tx,{action:id?"academics.exam_updated":"academics.exam_created",aggregateId:receipt.id});
      return receipt;
    },
  });
}
type Announcement=z.infer<typeof examAnnouncementReceipt>&{classId:string;offeringId:string;priorAnnouncementId:string|null};
export function announceExam(actor:ActorContext,id:string,key:string|null,input:z.infer<typeof examAnnounce>){
  return commitCommand(actor,"academics.exam.announce",key,hashCommand({id,...input}),{
    authorize:async(tx)=>{
      await staff(tx,actor);
      const record=await examRecord(tx,id);
      await scope(tx,record.offeringId,input.date,"academics.publish");
    },
    mutate:async(tx)=>{
      const [raw]=await tx<Announcement[]>`select announcement_id as "announcementId",prior_announcement_id as "priorAnnouncementId",revision,
        exam_date::text as date,left(exam_time::text,5) as time,class_id as "classId",offering_id as "offeringId",change_kind as change,
        to_char(announced_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "announcedAt"
        from app.announce_exam(${id},${input.revision},${input.date}::date,${input.time??null}::time,${input.time===undefined})`;
      if(!raw)throw new ApiError("stale_revision");
      await appendAudit(tx,{action:raw.change==="initial"?"academics.exam_announced":"academics.exam_rescheduled",aggregateId:id});
      await appendEvent(tx,{type:"exam.published",aggregateId:id,actorId:actor.accountId,payload:{
        examId:id,announcementId:raw.announcementId,priorAnnouncementId:raw.priorAnnouncementId,
        classId:raw.classId,offeringId:raw.offeringId,date:raw.date,time:raw.time,revision:raw.revision,change:raw.change,
      }});
      return examAnnouncementReceipt.parse(raw);
    },
  });
}
async function rosterScope(tx:Transaction,actor:ActorContext,id:string){
  await staff(tx,actor);
  const exam=await examRecord(tx,id);
  const [allowed]=await tx<{ok:boolean}[]>`select app.evaluation_staff_scope(${exam.offeringId},${exam.announcedDate??exam.date}::date) as ok`;
  if(!allowed.ok)throw new ApiError("not_found");
  return exam;
}
async function requirePupil(tx:Transaction,exam:string,pupil:string){
  const [allowed]=await tx`select 1 from app.exam_mark_roster(${exam}) where student_id=${pupil}`;
  if(!allowed)throw new ApiError("not_found");
}
export function listExamMarks(actor:ActorContext,id:string,query:z.infer<typeof examRosterQuery>){
  return withActor(actor,async(tx)=>{
    await rosterScope(tx,actor,id);
    const rows=examRosterRow.array().parse(await tx`select student_id as "studentId",student_name as "studentName",student_number as "studentNumber",
      enrollment_id as "enrollmentId",result_id as "resultId",revision,score::float8 as score,feedback,published_id as "publishedId",
      published_revision as "publishedRevision",published_score::float8 as "publishedScore",published_max_score::float8 as "publishedMaxScore",
      can_mark as "canMark",can_correct as "canCorrect",eligible,ready_to_publish as "readyToPublish"
      from app.exam_mark_roster(${id})
      where (${query.cursor??null}::uuid is null or student_id>${query.cursor??null}::uuid)
      order by student_id limit ${query.limit+1}`);
    return {items:rows.slice(0,query.limit),nextCursor:rows.length>query.limit?rows[query.limit-1].studentId:undefined};
  });
}
export function recordExamMark(actor:ActorContext,id:string,pupil:string,key:string|null,input:z.infer<typeof examMarkInput>){
  return commitCommand(actor,"academics.exam.mark",key,hashCommand({id,pupil,...input}),{
    authorize:async(tx)=>{
      const exam=await rosterScope(tx,actor,id);
      await scope(tx,exam.offeringId,exam.announcedDate??exam.date,"academics.grade");
      await requirePupil(tx,id,pupil);
    },
    mutate:async(tx)=>{
      const [out]=await tx`select result_id as "resultId",revision from app.write_exam_mark(${id},${pupil},${input.revision},
        ${input.score===null?null:String(input.score)}::numeric,${input.feedback}::text)`;
      if(!out)throw new ApiError("stale_revision");
      const result=examMarkReceipt.parse(out);
      await appendAudit(tx,{action:"academics.exam_marked",aggregateId:result.resultId});
      return result;
    },
  });
}
type PublishedRow={batchId:string;resultId:string;publicationId:string;studentId:string;classId:string;date:string;revision:number};
const publicationFields=(tx:Transaction)=>tx`batch_id as "batchId",result_id as "resultId",publication_id as "publicationId",student_id as "studentId",
  class_id as "classId",exam_date::text as date,revision`;
const eventPayload=(id:string,entry:PublishedRow,change:"initial"|"correction")=>({
  sourceKind:"exam",sourceId:id,classId:entry.classId,studentId:entry.studentId,batchId:entry.batchId,
  publicationId:entry.publicationId,date:entry.date,revision:entry.revision,change,
});
export function publishExamResults(actor:ActorContext,id:string,key:string|null,input:z.infer<typeof examResultPublish>){
  return commitCommand(actor,"academics.exam.results.publish",key,hashCommand({id,...input}),{
    authorize:async(tx)=>{
      const exam=await rosterScope(tx,actor,id);
      await scope(tx,exam.offeringId,exam.announcedDate??exam.date,"academics.publish");
    },
    mutate:async(tx)=>{
      const rows=await tx<PublishedRow[]>`select ${publicationFields(tx)} from app.publish_exam_results(
        ${id},${input.revision},${tx.json(input.reviewedRows)}::jsonb)`;
      if(rows.length!==input.reviewedRows.length)throw new ApiError("stale_revision");
      await appendAudit(tx,{action:"academics.exam_results_published",aggregateId:id,metadata:{batchId:rows[0].batchId,count:rows.length}});
      await appendEvents(tx,rows.map((entry)=>({type:"result.published",aggregateId:entry.resultId,actorId:actor.accountId,
        payload:eventPayload(id,entry,"initial"),
      })));
      return examResultBatchReceipt.parse({batchId:rows[0].batchId,rows});
    },
  });
}
export function correctExamResult(actor:ActorContext,id:string,pupil:string,key:string|null,input:z.infer<typeof examResultCorrect>){
  return commitCommand(actor,"academics.exam.results.correct",key,hashCommand({id,pupil,...input}),{
    authorize:async(tx)=>{
      const exam=await rosterScope(tx,actor,id);
      await requirePupil(tx,id,pupil);
      const [mark]=await tx<{date:string}[]>`select exam_date::text as date from app.exam_result_history(${id},${pupil}) order by revision desc limit 1`;
      if(!mark)throw new ApiError("not_found");
      await scope(tx,exam.offeringId,mark.date,"academics.publish");
    },
    mutate:async(tx)=>{
      const [entry]=await tx<PublishedRow[]>`select ${publicationFields(tx)} from app.correct_exam_result(
        ${id},${pupil},${input.revision},${String(input.score)}::numeric,${input.feedback}::text,${input.reason},${input.examRevision??null}::integer)`;
      if(!entry)throw new ApiError("stale_revision");
      await appendAudit(tx,{action:"academics.exam_result_corrected",aggregateId:entry.resultId,metadata:{batchId:entry.batchId,revision:entry.revision}});
      await appendEvent(tx,{type:"result.published",aggregateId:entry.resultId,actorId:actor.accountId,payload:eventPayload(id,entry,"correction")});
      return examResultCorrectionReceipt.parse(entry);
    },
  });
}
export function loadExamMarkHistory(actor:ActorContext,id:string,pupil:string){
  return withActor(actor,async(tx)=>{
    await rosterScope(tx,actor,id);
    await requirePupil(tx,id,pupil);
    return examResultHistory.array().parse(await tx`select publication_id as "publicationId",revision,score::float8 as score,
      max_score::float8 as "maxScore",feedback,exam_date::text as date,actor_name as "actorName",reason,
      to_char(occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "occurredAt"
      from app.exam_result_history(${id},${pupil}) order by revision desc`);
  });
}
