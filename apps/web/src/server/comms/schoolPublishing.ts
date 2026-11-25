import "server-only";
import {
  eventTiming,publishingOptions,schoolPublishingEntry,schoolPublishingReceipt,communicationCalendarDay,type communicationCalendarQuery,
  type PublishingContent,type eventsQuery,type newsQuery,
} from "@madrasty/contracts";
import {z} from "zod";
import {commitCommand,hashCommand} from "@/server/db/commands";
import {appendAudit} from "@/server/db/outbox";
import {withActor,type ActorContext,type Transaction} from "@/server/db/scoped";
import {ApiError} from "@/server/http";

type Kind="news"|"event";
type Change=({action:"save";revision:number}&PublishingContent)|{action:"publish"|"withdraw";revision:number};
const cursor=z.object({id:z.uuid(),sortAt:z.iso.datetime()});
const utc="YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"";
const fields=(tx:Transaction)=>tx`id,class_id as "classId",class_ar as "classAr",class_de as "classDe",
  source_locale as "sourceLocale",copy,state,revision,can_edit as "canEdit",
  to_char(published_at at time zone 'UTC',${utc}) as "publishedAt",
  to_char(changed_at at time zone 'UTC',${utc}) as "updatedAt",to_char(sort_at at time zone 'UTC',${utc}) as "sortAt",
  starts_local::date::text as "startDate",left(starts_local::time::text,5) as "startTime",
  ends_local::date::text as "endDate",left(ends_local::time::text,5) as "endTime",timezone,all_day as "allDay"`;
type Row={
  id:string;classId:string|null;startDate:string|null;startTime:string|null;endDate:string|null;endTime:string|null;
  allDay:boolean|null;sortAt:string;canEdit:boolean;
};
function shape(kind:Kind,row:Row){
  const audience=row.classId?{kind:"class",classId:row.classId}:{kind:"school"};
  return schoolPublishingEntry.parse({
    ...row,kind,audience,
    ...(kind==="event"?{timing:{allDay:row.allDay,start:{date:row.startDate,time:row.allDay?null:row.startTime},
      end:row.endDate?{date:row.endDate,time:row.allDay?null:row.endTime}:null}}:{}),
  });
}
function fromCursor(value?:string){
  if(!value)return null;
  try{return cursor.parse(JSON.parse(Buffer.from(value,"base64url").toString("utf8")));}
  catch{throw new ApiError("validation",{cursor:"error.validation"});}
}
async function read(tx:Transaction,kind:Kind,id:string){
  const [row]=await tx<Row[]>`select ${fields(tx)} from app.school_publishing_rows(${kind},'detail',${id},null,null)`;
  if(!row)throw new ApiError("not_found");
  return shape(kind,row);
}

export function schoolPublishingOptions(actor:ActorContext){
  return withActor(actor,async(tx)=>{
    const [calendar]=await tx`select school_date::text as "schoolDate",timezone,school_wide as "schoolWide" from app.school_publishing_calendar()`;
    const classes=await tx`select id,code,name_ar as "nameAr",name_de as "nameDe",can_write as "canWrite"
      from app.publishing_class_options() order by code,id`;
    return publishingOptions.parse({...calendar,classes});
  });
}

export function listSchoolPublishing(actor:ActorContext,kind:Kind,input:z.infer<typeof newsQuery>|z.infer<typeof eventsQuery>){
  const after=fromCursor(input.cursor),classId=input.classId??null,month="month" in input?`${input.month}-01`:null;
  return withActor(actor,async(tx)=>{
    if(input.view==="managed"&&actor.persona==="guardian")throw new ApiError("forbidden");
    if(classId){
      const [access]=await tx<{allowed:boolean}[]>`select app.publishing_class_read(${classId}) as allowed`;
      if(!access.allowed)throw new ApiError("not_found");
    }
    const at=after?.sortAt??null,afterId=after?.id??null;
    const day="day" in input?input.day??null:null;
    const next=kind==="event"?tx`(p.sort_at,p.id)>(${at}::timestamptz,${afterId}::uuid)`:tx`(p.sort_at,p.id)<(${at}::timestamptz,${afterId}::uuid)`;
    const sort=kind==="event"?tx`p.sort_at asc,p.id asc`:tx`p.sort_at desc,p.id desc`;
    const rows=await tx<Row[]>`select ${fields(tx)}
      from app.school_publishing_rows(${kind},${input.view},null,${classId},${month}::date) p
      where (${afterId}::uuid is null or ${next}) and (${day}::date is null or (p.starts_local<${day}::date+interval '1 day' and (p.starts_local>=${day}::date or coalesce(p.ends_local,case when p.all_day then p.starts_local+interval '1 day' end)>${day}::date))) order by ${sort} limit ${input.limit+1}`;
    const items=rows.slice(0,input.limit),tail=items.at(-1);
    return {items:items.map((row)=>shape(kind,row)),nextCursor:rows.length>input.limit&&tail?
      Buffer.from(JSON.stringify(cursor.parse(tail))).toString("base64url"):undefined};
  });
}

export function readSchoolPublishing(actor:ActorContext,kind:Kind,id:string){
  return withActor(actor,(tx)=>read(tx,kind,id));
}
const stamp=(value:{date:string;time:string|null})=>value.date+"T"+(value.time??"00:00");

export async function writeSchoolPublishing(actor:ActorContext,kind:Kind,key:string|null,input:PublishingContent|Change,target?:string){
  if(actor.persona==="guardian")throw new ApiError("forbidden");
  const operation="action" in input?input.action:"save";
  const revision="revision" in input?input.revision:null;
  const content="copy" in input?input:null;
  const classId=content?.audience.kind==="class"?content.audience.classId:null;
  const timing=content&&"timing" in content?eventTiming.parse(content.timing):null;
  const authorize=async(tx:Transaction)=>{
    if(target){
      const previous=await read(tx,kind,target);
      if(!previous.canEdit)throw new ApiError("forbidden");
    }
    if(content){
      const [access]=await tx<{allowed:boolean}[]>`select app.publishing_class_write(${classId}) as allowed`;
      if(!access.allowed)throw new ApiError("forbidden");
    }
  };
  const result=await commitCommand(actor,`comms.${kind}.${operation}`,key,hashCommand({id:target??null,...input}),{
    authorize,
    mutate:async(tx)=>{
      const [row]=await tx`select id,revision from app.write_school_publication(
        ${kind},${target??null}::uuid,${revision}::integer,${operation},${classId}::uuid,
        ${content?.sourceLocale??null}::text,${content?tx.json(content.copy):null}::jsonb,
        ${timing?stamp(timing.start):null}::timestamp,${timing?.end?stamp(timing.end):null}::timestamp,
        ${timing?.allDay??null}::boolean)`;
      if(!row)throw new ApiError("stale_revision");
      const receipt=schoolPublishingReceipt.parse(row);
      const action=operation==="save"?"saved":operation==="publish"?"published":"withdrawn";
      await appendAudit(tx,{action:`comms.${kind}_${action}`,aggregateId:receipt.id,metadata:{revision:receipt.revision}});
      return receipt;
    },
  });
  return readSchoolPublishing(actor,kind,result.data.id);
}

export function communicationCalendar(actor:ActorContext,input:z.infer<typeof communicationCalendarQuery>){
  const month=input.month+"-01",classId=input.classId??null;
  return withActor(actor,async tx=>{
    if(input.view==="managed"&&actor.persona==="guardian")throw new ApiError("forbidden");
    if(classId){const [access]=await tx<{allowed:boolean}[]>`select app.publishing_class_read(${classId}) as allowed`;if(!access?.allowed)throw new ApiError("not_found");}
    return communicationCalendarDay.array().parse(await tx`
      with events as (select * from app.school_publishing_rows('event',${input.view},null,${classId}::uuid,${month}::date))
      select d.day::text as date,d.teaching,
        (select count(*)::int from events e where e.starts_local<d.day+interval '1 day'
          and (e.starts_local>=d.day or coalesce(e.ends_local,case when e.all_day then e.starts_local+interval '1 day' end)>d.day)) as events
      from app.communication_school_days(${month}::date,${classId}::uuid) d order by d.day`);
  });
}
