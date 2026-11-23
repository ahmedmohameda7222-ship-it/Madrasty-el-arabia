import "server-only";
import {
  roomSchema, timetablePreviewSchema, timetableSlot, timetableWeekSchema,
  type DraftSlot, type TimetableIssue, type TimetablePreview, type TimetableSlot,
  type roomChangeInput, type roomInput, type timetablePatchInput, type timetablePreviewInput, type timetableSaveInput,
  type timetableWeekQuery,
} from "@madrasty/contracts";
import type { z } from "zod";
import { appendAudit } from "@/server/db/outbox";
import { commitCommand, hashCommand, requireRevision } from "@/server/db/commands";
import { withActor, type ActorContext, type Transaction } from "@/server/db/scoped";
import { ApiError } from "@/server/http";
import { classRecord, yearRecord } from "./enrollments";

async function timetableEditor(tx: Transaction, actor: ActorContext) {
  if (actor.persona !== "admin") throw new ApiError("forbidden");
  const [result] = await tx<{ allowed: boolean }[]>`select app.staff_editor() as allowed`;
  if (!result.allowed) throw new ApiError("forbidden");
}

const roomFields = (tx: Transaction) => tx`id, code, name_ar as "nameAr", name_de as "nameDe", revision`;
const slotFields = (tx: Transaction) => tx`id, assignment_id as "assignmentId", year_id as "yearId", class_id as "classId",
  room_id as "roomId", (select o.subject_id from app.class_subject o where o.id=offering_id) as "subjectId", weekday, starts_minute as start, ends_minute as end, effective_from::text as "from",
  effective_until::text as "untilExclusive", canceled_at is not null as canceled, revision`;

export function listRooms(actor: ActorContext) {
  return withActor(actor,async (tx)=>{
    await timetableEditor(tx,actor);
    return roomSchema.array().parse(await tx`select ${roomFields(tx)} from app.room order by code,id`);
  });
}

export function createRoom(actor: ActorContext, key: string | null, input: z.infer<typeof roomInput>) {
  return commitCommand(actor,"school.room.create",key,hashCommand(input),{
    authorize:(tx)=>timetableEditor(tx,actor),
    mutate:async (tx)=>{
      const [room]=await tx`insert into app.room(code,name_ar,name_de) values (${input.code},${input.nameAr},${input.nameDe})
        returning ${roomFields(tx)}`;
      const parsed=roomSchema.parse(room);
      await appendAudit(tx,{ action:"school.room_created",aggregateId:parsed.id });
      return parsed;
    },
  });
}

async function getRoom(tx: Transaction, id: string) {
  const [row]=await tx`select ${roomFields(tx)} from app.room where id=${id}`;
  if(!row)throw new ApiError("not_found");
  return roomSchema.parse(row);
}

export function updateRoom(actor: ActorContext, id: string, key: string | null, input: z.infer<typeof roomChangeInput>) {
  return commitCommand(actor,"school.room.change",key,hashCommand({id,...input}),{
    authorize:async(tx)=>{await timetableEditor(tx,actor);await getRoom(tx,id);},
    mutate:async(tx)=>{
      await tx`select app.lock_school_calendar()`;
      const room=await getRoom(tx,id);
      requireRevision(room.revision,input.revision);
      const [updated]=await tx`update app.room set code=${input.code},name_ar=${input.nameAr},name_de=${input.nameDe},
        revision=revision+1 where id=${id} returning ${roomFields(tx)}`;
      await appendAudit(tx,{action:"school.room_changed",aggregateId:id});
      return roomSchema.parse(updated);
    },
  });
}

async function getSlot(tx: Transaction,id: string) {
  const [row]=await tx`select ${slotFields(tx)} from app.weekly_slot where id=${id}`;
  if(!row)throw new ApiError("not_found");
  return timetableSlot.parse(row);
}

export function readSlot(actor: ActorContext,id: string,date?:string) {
  return withActor(actor,async(tx)=>{
    await timetableEditor(tx,actor);
    const original=await getSlot(tx,id);
    if(!date)return original;
    const [change]=await tx<{cancelled:boolean;assignmentId:string|null;subjectId:string|null;roomId:string|null;start:number|null;end:number|null}[]>`
      select v.cancelled,v.assignment_id as "assignmentId",o.subject_id as "subjectId",v.room_id as "roomId",
        v.starts_minute as start,v.ends_minute as end
      from app.weekly_slot_override v left join app.class_subject o on o.id=v.offering_id
      where v.slot_id=${id} and v.local_date=${date}::date`;
    return change&&!change.cancelled ? timetableSlot.parse({...original,
      assignmentId:change.assignmentId,subjectId:change.subjectId,roomId:change.roomId,start:change.start,end:change.end}) : original;
  });
}

type DateRange = { from: string; untilExclusive: string };
type TimedRange = DateRange & { weekday: number; start: number; end: number };
type Occupancy = TimedRange & { staffId: string };
type Term = DateRange & { id: string; classId: string; staffId: string; revision: number; kind: string; offeringId: string|null; subjectId: string|null };
type Delegate = DateRange & { assignmentId: string; staffId: string };
type Proposed = { draft: DraftSlot; classId: string; staff: Occupancy[]; issues: TimetableIssue[] };

function overlaps(a: TimedRange,b: TimedRange) {
  return a.weekday === b.weekday && a.start < b.end && b.start < a.end
    && a.from < b.untilExclusive && b.from < a.untilExclusive;
}

function containsWeekday(slot: DraftSlot) {
  const start=Date.parse(slot.from+"T00:00:00Z");
  const end=Date.parse(slot.untilExclusive+"T00:00:00Z");
  const isoDay=new Date(start).getUTCDay() || 7;
  return start+((slot.weekday-isoDay+7)%7)*86_400_000 < end;
}

function reserveStaff(draft: DraftSlot,term: Term,delegates: Delegate[]) {
  const staff: Occupancy[]=[{...draft,staffId:term.staffId}];
  for(const delegate of delegates){
    if(delegate.assignmentId!==term.id)continue;
    const from=delegate.from > draft.from ? delegate.from : draft.from;
    const untilExclusive=delegate.untilExclusive < draft.untilExclusive ? delegate.untilExclusive : draft.untilExclusive;
    if(from < untilExclusive)staff.push({...draft,from,untilExclusive,staffId:delegate.staffId});
  }
  return staff;
}

function issueOnce(issues: TimetableIssue[],field: TimetableIssue["field"]) {
  if(!issues.some((issue)=>issue.field===field && issue.kind==="clash")) issues.push({field,kind:"clash"});
}

async function preview(tx: Transaction, yearId: string, drafts: DraftSlot[], exclude?: string): Promise<TimetablePreview> {
  const year=await yearRecord(tx,yearId);
  if(year.state==="closed")throw new ApiError("conflict");
  if(exclude){
    const current=await getSlot(tx,exclude);
    if(current.canceled || current.yearId!==yearId)throw new ApiError("not_found");
  }
  const assignments=[...new Set(drafts.map((draft)=>draft.assignmentId))];
  const terms=new Map((await tx<Term[]>`
    select t.id,t.class_id as "classId",t.staff_id as "staffId",t.effective_from::text as "from",
      t.effective_until::text as "untilExclusive",t.revision,t.kind,t.offering_id as "offeringId",o.subject_id as "subjectId"
    from app.teaching_assignment t left join app.class_subject o on o.id=t.offering_id join app.school_class c on c.id=t.class_id
    join app.staff_profile p on p.id=t.staff_id
    join app.staff_accounts() owner on owner.account_id=p.account_id and 'teacher'=any(owner.roles)
    where p.disabled_at is null and p.active_from<=t.effective_from
      and (p.active_until is null or p.active_until>=t.effective_until) and c.year_id=${yearId} and t.id=any(${assignments}::uuid[])
      and t.kind in ('subject','primary','support') and t.revoked_at is null
  `).map((term)=>[term.id,term]));
  const delegates=await tx<Delegate[]>`
    select assignment_id as "assignmentId",staff_id as "staffId",effective_from::text as "from",
      effective_until::text as "untilExclusive" from app.substitute_assignment
    where assignment_id=any(${assignments}::uuid[]) and revoked_at is null and 'academics.log'=any(capabilities)
  `;
  const requestedSubjects=[...new Set(drafts.flatMap((draft)=>draft.subjectId?[draft.subjectId]:[]))];
  const validSubjects=new Set((await tx<{id:string}[]>`select id from app.subject where id=any(${requestedSubjects}::uuid[])`).map(({id})=>id));
  const roomIds=[...new Set(drafts.map((draft)=>draft.roomId))];
  const rooms=new Map((await tx<{id: string;revision: number}[]>`
    select id,revision from app.room where id=any(${roomIds}::uuid[])
  `).map((room)=>[room.id,room.revision]));
  const existing=await tx<(TimedRange & { classId: string; roomId: string })[]>`
    select class_id as "classId",room_id as "roomId",weekday,starts_minute as start,ends_minute as end,
      effective_from::text as "from",effective_until::text as "untilExclusive"
    from app.weekly_slot where year_id=${yearId} and canceled_at is null and id is distinct from ${exclude ?? null}::uuid
  `;
  const staffOccupancy=await tx<Occupancy[]>`
    select staff_id as "staffId",weekday,starts_minute as start,ends_minute as end,
      starts_on::text as "from",ends_exclusive::text as "untilExclusive"
    from app.timetable_teachers(${yearId}) where slot_id is distinct from ${exclude ?? null}::uuid
  `;
  // A one-off moved lesson occupies its actual room/teacher/time. Recurring
  // slot exclusion constraints alone cannot detect clashes with these changes.
  const special=await tx<{date:string;classId:string;roomId:string;staffId:string;start:number;end:number}[]>`
    with changed as (
      select v.local_date,v.assignment_id,l.class_id,v.room_id,
        v.starts_minute as starts,v.ends_minute as ends
      from app.weekly_slot_override v join app.weekly_slot l on l.id=v.slot_id
      where l.year_id=${yearId} and l.canceled_at is null and not v.cancelled
        and v.local_date>=l.effective_from and v.local_date<l.effective_until
        and v.slot_id is distinct from ${exclude ?? null}::uuid
    )
    select x.local_date::text as date,x.class_id as "classId",x.room_id as "roomId",
      a.staff_id as "staffId",x.starts as start,x.ends as end
    from changed x join app.teaching_assignment a on a.id=x.assignment_id
    union all
    select x.local_date::text,x.class_id,x.room_id,d.staff_id,x.starts,x.ends
    from changed x join app.substitute_assignment d on d.assignment_id=x.assignment_id
    where d.revoked_at is null and 'academics.log'=any(d.capabilities)
      and x.local_date>=d.effective_from and x.local_date<d.effective_until
  `;
  const proposed: Proposed[]=[];
  const entries=drafts.map((draft)=>{
    const issues: TimetableIssue[]=[];
    const term=terms.get(draft.assignmentId);
    const roomRevision=rooms.get(draft.roomId);
    if(!term)issues.push({field:"assignmentId",kind:"unavailable"});
    if(term && (term.kind==="subject"
      ? (draft.subjectId!==undefined && draft.subjectId!==term.subjectId)
      : !draft.subjectId))issues.push({field:"subjectId",kind:"unavailable"});
    if(draft.subjectId && !validSubjects.has(draft.subjectId))issues.push({field:"subjectId",kind:"unavailable"});
    if(!roomRevision)issues.push({field:"roomId",kind:"unavailable"});
    if(draft.start>=draft.end)issues.push({field:"end",kind:"interval"});
    if(draft.from<year.starts || term && draft.from<term.from)issues.push({field:"from",kind:"interval"});
    if(draft.from>=draft.untilExclusive || draft.untilExclusive>year.ends || term && draft.untilExclusive>term.untilExclusive){
      issues.push({field:"untilExclusive",kind:"interval"});
    }
    if(draft.from<draft.untilExclusive && !containsWeekday(draft))issues.push({field:"weekday",kind:"interval"});
    if(!term || !roomRevision || issues.length)return {slot:null,issues};
    const staff=reserveStaff(draft,term,delegates);
    proposed.push({draft,classId:term.classId,staff,issues});
    for(const slot of existing){
      if(!overlaps(draft,slot))continue;
      if(slot.classId===term.classId)issueOnce(issues,"classId");
      if(slot.roomId===draft.roomId)issueOnce(issues,"roomId");
    }
    if(staff.some((candidate)=>staffOccupancy.some((slot)=>slot.staffId===candidate.staffId && overlaps(candidate,slot)))){
      issueOnce(issues,"staffId");
    }
    for(const changed of special){
      if(changed.date<draft.from||changed.date>=draft.untilExclusive)continue;
      const weekday=new Date(changed.date+"T12:00:00Z").getUTCDay()||7;
      if(weekday!==draft.weekday||draft.start>=changed.end||changed.start>=draft.end)continue;
      if(changed.classId===term.classId)issueOnce(issues,"classId");
      if(changed.roomId===draft.roomId)issueOnce(issues,"roomId");
      if(staff.some(candidate=>candidate.staffId===changed.staffId
        && changed.date>=candidate.from&&changed.date<candidate.untilExclusive))issueOnce(issues,"staffId");
    }
    return {slot:{...draft,assignmentRevision:term.revision,roomRevision},issues};
  });
  for(const [index,first] of proposed.entries()){
    for(const second of proposed.slice(index+1)){
      if(!overlaps(first.draft,second.draft))continue;
      if(first.classId===second.classId){issueOnce(first.issues,"classId");issueOnce(second.issues,"classId");}
      if(first.draft.roomId===second.draft.roomId){issueOnce(first.issues,"roomId");issueOnce(second.issues,"roomId");}
      if(first.staff.some((one)=>second.staff.some((two)=>one.staffId===two.staffId && overlaps(one,two)))){
        issueOnce(first.issues,"staffId");issueOnce(second.issues,"staffId");
      }
    }
  }
  return timetablePreviewSchema.parse({yearRevision:year.revision,entries,canSave:entries.every((entry)=>!entry.issues.length)});
}

export function previewTimetable(actor: ActorContext,input: z.infer<typeof timetablePreviewInput>) {
  return withActor(actor,async(tx)=>{
    await timetableEditor(tx,actor);
    return preview(tx,input.yearId,input.slots,input.editingId);
  });
}

function checkReview(current: TimetablePreview, yearRevision: number, slots: z.infer<typeof timetableSaveInput>["slots"]) {
  requireRevision(current.yearRevision,yearRevision);
  if(!current.canSave){
    throw new ApiError("conflict",Object.fromEntries(current.entries.flatMap(({issues},index)=>
      issues.map(({field})=>[`slots.${index}.${field}`,"error.conflict"]),
    )));
  }
  slots.forEach((draft,index)=>{
    const saved=current.entries[index].slot;
    if(!saved)throw new ApiError("conflict");
    requireRevision(saved.assignmentRevision,draft.assignmentRevision);
    requireRevision(saved.roomRevision,draft.roomRevision);
  });
}

async function offeringFor(tx:Transaction,draft:DraftSlot) {
  if(!draft.subjectId)return null;
  const [row]=await tx<{id:string}[]>`
    insert into app.class_subject(class_id,subject_id)
    select class_id,${draft.subjectId}::uuid from app.teaching_assignment where id=${draft.assignmentId}
    on conflict(class_id,subject_id) do update set subject_id=excluded.subject_id returning id`;
  if(!row)throw new ApiError("conflict");
  return row.id;
}
async function insertSlot(tx: Transaction,draft: DraftSlot) {
  const offeringId=await offeringFor(tx,draft);
  const [slot]=await tx<{id:string}[]>`insert into app.weekly_slot (assignment_id,offering_id,room_id,weekday,starts_minute,ends_minute,effective_from,effective_until)
    values (${draft.assignmentId},${offeringId},${draft.roomId},${draft.weekday},${draft.start},${draft.end},${draft.from}::date,${draft.untilExclusive}::date)
    returning id`;
  return slot.id;
}

export function saveTimetable(actor: ActorContext,key: string | null,input: z.infer<typeof timetableSaveInput>) {
  return commitCommand(actor,"school.timetable.create",key,hashCommand(input),{
    authorize:async(tx)=>{await timetableEditor(tx,actor);await yearRecord(tx,input.yearId);},
    mutate:async(tx)=>{
      await tx`select app.lock_school_calendar()`;
      checkReview(await preview(tx,input.yearId,input.slots),input.yearRevision,input.slots);
      const ids: string[]=[];
      for(const draft of input.slots){
        const id=await insertSlot(tx,draft);
        await appendAudit(tx,{action:"school.timetable_added",aggregateId:id});
        ids.push(id);
      }
      return {ids};
    },
  });
}

function dayAfter(date:string) {
  const next=new Date(date+"T12:00:00Z");
  next.setUTCDate(next.getUTCDate()+1);
  return next.toISOString().slice(0,10);
}

type OccurrenceChange=Extract<z.infer<typeof timetablePatchInput>,{date:string}>;

async function assertOccurrence(tx:Transaction,before:TimetableSlot,date:string) {
  const [day]=await tx<{today:string|null}[]>`select app.school_today()::text as today`;
  const iso=new Date(date+"T12:00:00Z").getUTCDay()||7;
  if(before.canceled || date<before.from || date>=before.untilExclusive || iso!==before.weekday
    || !day?.today || date<day.today)throw new ApiError("conflict");
  const year=await yearRecord(tx,before.yearId);
  if(year.state!=="active")throw new ApiError("conflict");
}

async function checkSingleCollision(tx:Transaction,before:TimetableSlot,date:string,draft:DraftSlot) {
  const [assn]=await tx<{classId:string;staffId:string}[]>`
    select class_id as "classId",staff_id as "staffId" from app.teaching_assignment where id=${draft.assignmentId}`;
  if(!assn || assn.classId!==before.classId)throw new ApiError("conflict");
  const busy=await tx<{slotId:string;classId:string;roomId:string;staffId:string;start:number;end:number}[]>`
    select slot_id as "slotId",class_id as "classId",room_id as "roomId",staff_id as "staffId",
      starts_minute as start,ends_minute as end
    from app.timetable_day_occupancy(${date}::date) where slot_id<>${before.id}::uuid`;
  const [alternates]=await tx<{staffId:string}[]>`
    select staff_id as "staffId" from app.substitute_assignment
    where assignment_id=${draft.assignmentId} and revoked_at is null
      and 'academics.log'=any(capabilities)
      and effective_from<=${date}::date and effective_until>${date}::date limit 1`;
  const reserved=new Set([assn.staffId,...(alternates?[alternates.staffId]:[])]);
  if(busy.some(row=>row.start<draft.end&&draft.start<row.end
    &&(row.classId===before.classId||row.roomId===draft.roomId||reserved.has(row.staffId))))
    throw new ApiError("conflict");
}

async function changeOccurrence(tx:Transaction,before:TimetableSlot,input:OccurrenceChange):Promise<TimetableSlot> {
  const date=input.date;
  await assertOccurrence(tx,before,date);
  if("slot" in input && input.slot.weekday!==before.weekday)throw new ApiError("conflict");
  if(input.scope==="single"){
    if("cancel" in input){
      await tx`insert into app.weekly_slot_override(slot_id,local_date,cancelled)
        values(${before.id},${date}::date,true)
        on conflict(slot_id,local_date) do update set cancelled=true,assignment_id=null,
          offering_id=null,room_id=null,starts_minute=null,ends_minute=null,revision=app.weekly_slot_override.revision+1`;
    }else{
      const draft={...input.slot,from:date,untilExclusive:dayAfter(date)};
      checkReview(await preview(tx,before.yearId,[draft],before.id),input.yearRevision,[input.slot]);
      await checkSingleCollision(tx,before,date,draft);
      const offeringId=await offeringFor(tx,draft);
      const [origin]=await tx<{offeringId:string|null}[]>`
        select offering_id as "offeringId" from app.teaching_assignment where id=${draft.assignmentId}`;
      const chosenOffering=offeringId??origin?.offeringId;
      if(!chosenOffering)throw new ApiError("conflict");
      await tx`insert into app.weekly_slot_override
        (slot_id,local_date,cancelled,assignment_id,offering_id,room_id,starts_minute,ends_minute)
        values(${before.id},${date}::date,false,${draft.assignmentId},${chosenOffering},
          ${draft.roomId},${draft.start},${draft.end})
        on conflict(slot_id,local_date) do update set cancelled=false,
          assignment_id=excluded.assignment_id,offering_id=excluded.offering_id,
          room_id=excluded.room_id,starts_minute=excluded.starts_minute,
          ends_minute=excluded.ends_minute,revision=app.weekly_slot_override.revision+1`;
    }
    await tx`update app.weekly_slot set revision=revision+1 where id=${before.id}`;
    await appendAudit(tx,{action:"school.timetable_changed",aggregateId:before.id,
      metadata:{date,scope:"single",cancelled:"cancel" in input}});
    return getSlot(tx,before.id);
  }

  // Future edits split the recurrence at the selected day's occurrence.
  // Past dates, other weekdays and prior one-off changes remain intact.
  const earlier={...before,untilExclusive:date};
  if(containsWeekday(earlier)){
    await tx`update app.weekly_slot set effective_until=${date}::date,
      revision=revision+1 where id=${before.id}`;
  }else{
    await tx`update app.weekly_slot set canceled_at=now(),revision=revision+1 where id=${before.id}`;
  }
  if("cancel" in input){
    await appendAudit(tx,{action:"school.timetable_canceled",aggregateId:before.id,
      metadata:{date,scope:"future"}});
    return getSlot(tx,before.id);
  }
  const draft={...input.slot,from:date,untilExclusive:before.untilExclusive};
  const [assn]=await tx<{classId:string}[]>`
    select class_id as "classId" from app.teaching_assignment where id=${draft.assignmentId}`;
  if(assn?.classId!==before.classId)throw new ApiError("conflict");
  checkReview(await preview(tx,before.yearId,[draft]),input.yearRevision,[input.slot]);
  const id=await insertSlot(tx,draft);
  await tx`update app.weekly_slot_override set slot_id=${id}
    where slot_id=${before.id} and local_date>=${date}::date`;
  await appendAudit(tx,{action:"school.timetable_changed",aggregateId:id,
    metadata:{date,scope:"future",previousSlotId:before.id}});
  return getSlot(tx,id);
}

export function updateSlot(actor: ActorContext,id: string,key: string | null,input: z.infer<typeof timetablePatchInput>) {
  return commitCommand(actor,"school.timetable.change",key,hashCommand({id,...input}),{
    authorize:async(tx)=>{await timetableEditor(tx,actor);await getSlot(tx,id);},
    mutate:async(tx): Promise<TimetableSlot>=>{
      await tx`select app.lock_school_calendar()`;
      const before=await getSlot(tx,id);
      const year=await yearRecord(tx,before.yearId);
      requireRevision(before.revision,input.revision);
      if(before.canceled || year.state==="closed")throw new ApiError("conflict");
      if("date" in input)return changeOccurrence(tx,before,input);
      if("cancel" in input){
        await tx`update app.weekly_slot set canceled_at=now(),revision=revision+1 where id=${id}`;
      } else {
        const draft=input.slot;
        checkReview(await preview(tx,before.yearId,[draft],id),input.yearRevision,[draft]);
        const offeringId=await offeringFor(tx,draft);
        await tx`update app.weekly_slot set assignment_id=${draft.assignmentId},offering_id=coalesce(${offeringId}::uuid,offering_id),room_id=${draft.roomId},weekday=${draft.weekday},
          starts_minute=${draft.start},ends_minute=${draft.end},effective_from=${draft.from}::date,
          effective_until=${draft.untilExclusive}::date,revision=revision+1 where id=${id}`;
      }
      await appendAudit(tx,{action:"cancel" in input?"school.timetable_canceled":"school.timetable_changed",aggregateId:id});
      return getSlot(tx,id);
    },
  });
}

export function readTimetableWeek(actor: ActorContext,input: z.infer<typeof timetableWeekQuery>) {
  return withActor(actor,async(tx)=>{
    if(actor.persona==="guardian"){
      if(!input.childId || input.classId)throw new ApiError("validation");
      const [access]=await tx<{allowed:boolean}[]>`select app.has_child_link(${input.childId}) as allowed`;
      if(!access.allowed)throw new ApiError("not_found");
    } else if(input.childId){
      throw new ApiError("validation");
    } else if(actor.persona==="admin"){
      await timetableEditor(tx,actor);
      if(input.classId)await classRecord(tx,input.classId);
    }
    const [scope]=await tx<{weekOf: string;timezone: string}[]>`
      select week_of::text as "weekOf",timezone from app.timetable_week_info(${input.weekOf ?? null}::date)
    `;
    if(!scope?.weekOf)throw new ApiError("unavailable");
    const classId=input.classId ?? null, childId=input.childId ?? null;
    const slots=await tx`select slot_id as id,assignment_id as "assignmentId",class_id as "classId",class_code as "classCode",
      class_name_ar as "classNameAr",class_name_de as "classNameDe",subject_name_ar as "subjectNameAr",subject_name_de as "subjectNameDe",
      room_code as "roomCode",room_name_ar as "roomNameAr",room_name_de as "roomNameDe",teacher_name as "teacherName",
      substitute,local_date::text as date,teaching,starts_minute as start,ends_minute as end,revision
      from app.timetable_week(${scope.weekOf}::date,${classId},${childId}) order by local_date,starts_minute,class_code,slot_id`;
    const days=await tx`select local_date::text as date,teaching
      from app.timetable_days(${scope.weekOf}::date,${actor.persona==="admin"?classId:null},${childId}) order by local_date`;
    return timetableWeekSchema.parse({...scope,days,slots});
  });
}
