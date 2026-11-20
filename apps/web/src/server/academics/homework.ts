import "server-only";
import { homeworkEntry,schoolDateSchema,type homeworkChange,type homeworkCreate,type homeworkListQuery } from "@madrasty/contracts";
import { z } from "zod";
import { commitCommand,hashCommand } from "@/server/db/commands";
import { appendAudit } from "@/server/db/outbox";
import { withActor,type ActorContext,type Transaction } from "@/server/db/scoped";
import { ApiError } from "@/server/http";
import { academicReadScope } from "./curriculum";

const pagePosition=z.object({issuedOn:schoolDateSchema,id:z.uuid()});
function position(value?:string){
  if(!value)return null;
  try{
    if(!/^[A-Za-z0-9_-]{1,180}$/.test(value))throw new Error("cursor");
    return pagePosition.parse(JSON.parse(Buffer.from(value,"base64url").toString("utf8")));
  }catch{throw new ApiError("validation",{cursor:"error.validation"});}
}
const fields=(tx:Transaction)=>tx`id,offering_id as "offeringId",class_id as "classId",class_code as "classCode",
  class_name_ar as "classNameAr",class_name_de as "classNameDe",year_id as "yearId",year_start::text as "yearStart",year_end::text as "yearEnd",
  subject_id as "subjectId",subject_name_ar as "subjectNameAr",subject_name_de as "subjectNameDe",lesson_id as "lessonId",
  title,instructions,issued_on::text as "issuedOn",due_on::text as "dueOn",revision,roster_count as "rosterCount",can_edit as "canEdit",
  can_grade as "canGrade",joined_on::text as "joinedOn",added_later as "addedLater",score::float8 as score,feedback`;

export async function homeworkRecord(tx:Transaction,id:string,child?:string){
  const [row]=await tx`select ${fields(tx)} from app.homework_projection(${child??null}::uuid,null,null,${id})`;
  if(!row)throw new ApiError("not_found");
  return homeworkEntry.parse(row);
}
export function readHomework(actor:ActorContext,id:string,child?:string){
  return withActor(actor,async(tx)=>{
    await academicReadScope(tx,actor,child);
    return homeworkRecord(tx,id,child);
  });
}
export function listHomework(actor:ActorContext,query:z.infer<typeof homeworkListQuery>){
  return withActor(actor,async(tx)=>{
    await academicReadScope(tx,actor,query.childId);
    const after=position(query.cursor);
    const rows=homeworkEntry.array().parse(await tx`select ${fields(tx)}
      from app.homework_projection(${query.childId??null}::uuid,${query.classId??null}::uuid,${query.offeringId??null}::uuid,null)
      where (${after?.id??null}::uuid is null or (issued_on,id)<(${after?.issuedOn??null}::date,${after?.id??null}::uuid))
      order by issued_on desc,id desc limit ${query.limit+1}`);
    const items=rows.slice(0,query.limit),last=items.at(-1);
    return {items,nextCursor:rows.length>query.limit&&last
      ?Buffer.from(JSON.stringify({issuedOn:last.issuedOn,id:last.id})).toString("base64url"):undefined};
  });
}

type HomeworkDraft=z.infer<typeof homeworkCreate>|z.infer<typeof homeworkChange>;
export function writeHomework(actor:ActorContext,key:string|null,input:HomeworkDraft,id?:string){
  const offering="offeringId" in input?input.offeringId:null;
  const revision="revision" in input?input.revision:null;
  return commitCommand(actor,id?"academics.homework.change":"academics.homework.create",key,hashCommand({id:id??null,...input}),{
    authorize:async(tx)=>{
      if(actor.persona==="guardian")throw new ApiError("forbidden");
      await academicReadScope(tx,actor);
      const existing=id?await homeworkRecord(tx,id):null;
      const [scope]=await tx<{allowed:boolean}[]>`select app.homework_staff_scope(
        ${existing?.offeringId??offering}::uuid,${existing?.issuedOn??input.issuedOn}::date,'academics.plan'
      ) as allowed`;
      if(!scope.allowed)throw new ApiError("not_found");
    },
    mutate:async(tx)=>{
      const [saved]=await tx<{id:string}[]>`select id from app.write_homework(
        ${id??null}::uuid,${offering}::uuid,${input.lessonId}::uuid,${input.title},${input.instructions},${input.issuedOn}::date,
        ${input.dueOn}::date,${revision}::integer)`;
      if(!saved)throw new ApiError("stale_revision");
      await appendAudit(tx,{action:id?"academics.homework_updated":"academics.homework_assigned",aggregateId:saved.id});
      return homeworkRecord(tx,saved.id);
    },
  });
}
