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
  room_id as "roomId", weekday, starts_minute as start, ends_minute as end, effective_from::text as "from",
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

export function readSlot(actor: ActorContext,id: string) {
  return withActor(actor,async(tx)=>{await timetableEditor(tx,actor);return getSlot(tx,id);});
}

type DateRange = { from: string; untilExclusive: string };
type TimedRange = DateRange & { weekday: number; start: number; end: number };
type Occupancy = TimedRange & { staffId: string };
type Term = DateRange & { id: string; classId: string; staffId: string; revision: number };
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
      t.effective_until::text as "untilExclusive",t.revision
    from app.teaching_assignment t join app.school_class c on c.id=t.class_id
    join app.staff_profile p on p.id=t.staff_id
    join app.staff_accounts() owner on owner.account_id=p.account_id and 'teacher'=any(owner.roles)
    where p.disabled_at is null and p.active_from<=t.effective_from
      and (p.active_until is null or p.active_until>=t.effective_until) and c.year_id=${yearId} and t.id=any(${assignments}::uuid[])
      and t.kind='subject' and t.revoked_at is null
  `).map((term)=>[term.id,term]));
  const delegates=await tx<Delegate[]>`
    select assignment_id as "assignmentId",staff_id as "staffId",effective_from::text as "from",
      effective_until::text as "untilExclusive" from app.substitute_assignment
    where assignment_id=any(${assignments}::uuid[]) and revoked_at is null and 'academics.log'=any(capabilities)
  `;
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
  const proposed: Proposed[]=[];
  const entries=drafts.map((draft)=>{
    const issues: TimetableIssue[]=[];
    const term=terms.get(draft.assignmentId);
    const roomRevision=rooms.get(draft.roomId);
    if(!term)issues.push({field:"assignmentId",kind:"unavailable"});
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

async function insertSlot(tx: Transaction,draft: DraftSlot) {
  const [slot]=await tx<{id:string}[]>`insert into app.weekly_slot (assignment_id,room_id,weekday,starts_minute,ends_minute,effective_from,effective_until)
    values (${draft.assignmentId},${draft.roomId},${draft.weekday},${draft.start},${draft.end},${draft.from}::date,${draft.untilExclusive}::date)
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

export function updateSlot(actor: ActorContext,id: string,key: string | null,input: z.infer<typeof timetablePatchInput>) {
  return commitCommand(actor,"school.timetable.change",key,hashCommand({id,...input}),{
    authorize:async(tx)=>{await timetableEditor(tx,actor);await getSlot(tx,id);},
    mutate:async(tx): Promise<TimetableSlot>=>{
      await tx`select app.lock_school_calendar()`;
      const before=await getSlot(tx,id);
      const year=await yearRecord(tx,before.yearId);
      requireRevision(before.revision,input.revision);
      if(before.canceled || year.state==="closed")throw new ApiError("conflict");
      if("cancel" in input){
        await tx`update app.weekly_slot set canceled_at=now(),revision=revision+1 where id=${id}`;
      } else {
        const draft=input.slot;
        checkReview(await preview(tx,before.yearId,[draft],id),input.yearRevision,[draft]);
        await tx`update app.weekly_slot set assignment_id=${draft.assignmentId},room_id=${draft.roomId},weekday=${draft.weekday},
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
