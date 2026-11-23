import "server-only";
import {
  curriculumLesson,curriculumOffering,curriculumSubject,lessonPublished,lessonReceipt,
  type curriculumSubjectChange,type curriculumSubjectCreate,type curriculumSubjectsQuery,
  type lessonChange,type lessonCreate,type lessonListQuery,
} from "@madrasty/contracts";
import { z } from "zod";
import { requireCapability } from "@/server/access/policies";
import { commitCommand,hashCommand,requireRevision } from "@/server/db/commands";
import { appendAudit } from "@/server/db/outbox";
import { withActor,type ActorContext,type Transaction } from "@/server/db/scoped";
import { ApiError } from "@/server/http";

export async function academicReadScope(tx:Transaction,actor:ActorContext,child?:string){
  if(actor.persona==="guardian"){
    if(!child)throw new ApiError("validation",{childId:"error.validation"});
    const [link]=await tx<{allowed:boolean}[]>`select app.has_child_link(${child}) as allowed`;
    if(!link.allowed)throw new ApiError("not_found");
  }else{
    if(child)throw new ApiError("validation",{childId:"error.validation"});
    if(actor.persona==="admin")await requireCapability(tx,actor,"academics.supervise");
  }
}

const subjectColumns=(tx:Transaction)=>tx`id,code,name_ar as "nameAr",name_de as "nameDe",
  description_ar as "descriptionAr",description_de as "descriptionDe",archived_at is not null as archived,revision`;
const publishedSubjectColumns=(tx:Transaction)=>tx`id,code,name_ar as "nameAr",name_de as "nameDe",
  description_ar as "descriptionAr",description_de as "descriptionDe",archived,revision`;

export function listCurriculumSubjects(actor:ActorContext,query:z.infer<typeof curriculumSubjectsQuery>){
  return withActor(actor,async(tx)=>{
    await academicReadScope(tx,actor,query.childId);
    const rows=curriculumSubject.array().parse(await tx`
      select ${publishedSubjectColumns(tx)} from app.curriculum_subjects(${query.childId??null}::uuid)
      where (${query.cursor??null}::uuid is null or id>${query.cursor??null}::uuid)
      order by id limit ${query.limit+1}`);
    return {items:rows.slice(0,query.limit),nextCursor:rows.length>query.limit?rows[query.limit-1].id:undefined};
  });
}

export function readCurriculumSubject(actor:ActorContext,id:string,child?:string){
  return withActor(actor,async(tx)=>{
    await academicReadScope(tx,actor,child);
    const [row]=await tx`select ${publishedSubjectColumns(tx)} from app.curriculum_subjects(${child??null}::uuid) where id=${id}`;
    if(!row)throw new ApiError("not_found");
    return curriculumSubject.parse(row);
  });
}

export function createCurriculumSubject(actor:ActorContext,key:string|null,input:z.infer<typeof curriculumSubjectCreate>){
  return commitCommand(actor,"academics.subject.create",key,hashCommand(input),{
    authorize:(tx)=>requireCapability(tx,actor,"academics.supervise"),
    mutate:async(tx)=>{
      const [row]=await tx`insert into app.subject(code,name_ar,name_de,description_ar,description_de)
        values(${input.code},${input.nameAr},${input.nameDe},${input.descriptionAr},${input.descriptionDe})
        returning ${subjectColumns(tx)}`;
      const value=curriculumSubject.parse(row);
      await appendAudit(tx,{action:"academics.subject_created",aggregateId:value.id});
      return value;
    },
  });
}

export function changeCurriculumSubject(actor:ActorContext,id:string,key:string|null,input:z.infer<typeof curriculumSubjectChange>){
  return commitCommand(actor,"academics.subject.change",key,hashCommand({id,...input}),{
    authorize:async(tx)=>{
      await requireCapability(tx,actor,"academics.supervise");
      const [row]=await tx`select id from app.subject where id=${id}`;
      if(!row)throw new ApiError("not_found");
    },
    mutate:async(tx)=>{
      await tx`select app.lock_school_calendar()`;
      const [current]=await tx<{revision:number}[]>`select revision from app.subject where id=${id} for update`;
      requireRevision(current.revision,input.revision);
      const [row]=await tx`update app.subject set name_ar=${input.nameAr},name_de=${input.nameDe},
        description_ar=${input.descriptionAr},description_de=${input.descriptionDe},
        archived_at=case when ${input.archived} then coalesce(archived_at,now()) end,revision=revision+1
        where id=${id} returning ${subjectColumns(tx)}`;
      await appendAudit(tx,{action:"academics.subject_updated",aggregateId:id});
      return curriculumSubject.parse(row);
    },
  });
}

export function listCurriculumOfferings(actor:ActorContext,child?:string){
  return withActor(actor,async(tx)=>{
    await academicReadScope(tx,actor,child);
    return curriculumOffering.array().parse(await tx`select id,subject_id as "subjectId",
      class_id as "classId",class_code as "classCode",class_name_ar as "classNameAr",class_name_de as "classNameDe",
      year_id as "yearId",year_start::text as "yearStart",year_end::text as "yearEnd",
      ${actor.persona==="teacher"}::boolean and can_plan as "canPlan",
      ${actor.persona==="teacher"}::boolean and can_publish as "canPublish",
      ${actor.persona==="teacher"}::boolean and ${child??null}::uuid is null
        and app.academic_offering_scope(id,app.school_today(),'academics.log') as "canLog",
      ${actor.persona==="teacher"}::boolean and ${child??null}::uuid is null
        and app.academic_offering_scope(id,app.school_today(),'academics.grade') as "canGrade"
      from app.curriculum_offerings(${child??null}::uuid)
      order by year_start desc,class_code,id`);
  });
}

const sortCursor=z.object({id:z.uuid(),order:z.int().min(0).max(10000)});
function readCursor(raw?:string){
  if(!raw)return null;
  try{
    if(!/^[A-Za-z0-9_-]{1,200}$/.test(raw))throw new Error("cursor");
    return sortCursor.parse(JSON.parse(Buffer.from(raw,"base64url").toString("utf8")));
  }catch{throw new ApiError("validation",{cursor:"error.validation"});}
}
function lessonColumns(tx:Transaction,child?:string){
  return tx`id,offering_id as "offeringId",unit_id as "unitId",sort_order as "sortOrder",planned_date::text as "plannedDate",
    source_language as "sourceLanguage",title_ar as "titleAr",body_ar as "bodyAr",title_de as "titleDe",body_de as "bodyDe",
    revision,publication_id as "publicationId",
    to_char(published_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "publishedAt",
    published_revision as "publishedRevision",can_edit as "canEdit",can_publish as "canPublish",
    app.curriculum_delivery_date(${child??null}::uuid,id)::text as "latestDeliveryDate"`;
}

export function listCurriculumLessons(actor:ActorContext,query:z.infer<typeof lessonListQuery>){
  if(actor.persona==="admin")throw new ApiError("forbidden");
  return withActor(actor,async(tx)=>{
    await academicReadScope(tx,actor,query.childId);
    const cursor=readCursor(query.cursor);
    const rows=curriculumLesson.array().parse(await tx`
      select ${lessonColumns(tx,query.childId)} from app.curriculum_projection(${query.childId??null}::uuid,${query.offeringId??null}::uuid,null)
      where (${cursor?.id??null}::uuid is null or (sort_order,id)>(${cursor?.order??null}::integer,${cursor?.id??null}::uuid))
      order by sort_order,id limit ${query.limit+1}`);
    const items=rows.slice(0,query.limit),end=items.at(-1);
    return {items,nextCursor:rows.length>query.limit&&end?Buffer.from(JSON.stringify({id:end.id,order:end.sortOrder})).toString("base64url"):undefined};
  });
}

export function readCurriculumLesson(actor:ActorContext,id:string,child?:string){
  if(actor.persona==="admin")throw new ApiError("forbidden");
  return withActor(actor,async(tx)=>{
    await academicReadScope(tx,actor,child);
    const [row]=await tx`select ${lessonColumns(tx,child)} from app.curriculum_projection(${child??null}::uuid,null,${id})`;
    if(!row)throw new ApiError("not_found");
    return curriculumLesson.parse(row);
  });
}

type SaveLesson=z.infer<typeof lessonChange>|z.infer<typeof lessonCreate>;
async function lessonPermission(tx:Transaction,actor:ActorContext,id:string,capability:"academics.plan"|"academics.publish"){
  if(actor.persona==="guardian")throw new ApiError("forbidden");
  if(actor.persona==="admin")await requireCapability(tx,actor,"academics.supervise");
  const [row]=await tx<{allowed:boolean}[]>`select app.curriculum_require_draft_scope(${id},${capability}) as allowed`;
  if(!row.allowed)throw new ApiError("not_found");
}

export function saveCurriculumLesson(actor:ActorContext,key:string|null,input:SaveLesson,id?:string){
  if(actor.persona!=="teacher")throw new ApiError("forbidden");
  const offeringId="offeringId" in input?input.offeringId:null;
  const revision="revision" in input?input.revision:null;
  return commitCommand(actor,id?"academics.lesson.change":"academics.lesson.create",key,hashCommand({id:id??null,...input}),{
    authorize:async(tx)=>{
      if(id)return lessonPermission(tx,actor,id,"academics.plan");
      if(actor.persona==="guardian")throw new ApiError("forbidden");
      if(actor.persona==="admin")await requireCapability(tx,actor,"academics.supervise");
      const [scope]=await tx<{allowed:boolean}[]>`select app.academic_offering_scope(${offeringId}::uuid,
        coalesce(${input.plannedDate}::date,app.school_today()),'academics.plan') as allowed`;
      if(!scope.allowed)throw new ApiError("not_found");
    },
    mutate:async(tx)=>{
      const [row]=await tx`select lesson_id as id,result_revision as revision from app.save_curriculum_draft(
        ${id??null}::uuid,${offeringId}::uuid,${input.unitId}::uuid,${input.sortOrder},${input.plannedDate}::date,
        ${input.sourceLanguage},${input.titleAr},${input.bodyAr},${input.titleDe},${input.bodyDe},${revision}::integer)`;
      if(!row)throw new ApiError("stale_revision");
      const receipt=lessonReceipt.parse(row);
      await appendAudit(tx,{action:id?"academics.lesson_updated":"academics.lesson_created",aggregateId:receipt.id});
      return receipt;
    },
  });
}

export function publishCurriculumLesson(actor:ActorContext,id:string,key:string|null,revision:number){
  if(actor.persona!=="teacher")throw new ApiError("forbidden");
  return commitCommand(actor,"academics.lesson.publish",key,hashCommand({id,revision}),{
    authorize:(tx)=>lessonPermission(tx,actor,id,"academics.publish"),
    mutate:async(tx)=>{
      const [row]=await tx`select publication_id as "publicationId",
        to_char(publication_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "publishedAt",
        result_revision as revision from app.publish_curriculum_draft(${id},${revision})`;
      if(!row)throw new ApiError("stale_revision");
      await appendAudit(tx,{action:"academics.lesson_published",aggregateId:id,metadata:{revision}});
      return lessonPublished.parse(row);
    },
  });
}
