import "server-only";
import {
  queueItemSchema, queuePageSchema, schoolQueueKeySchema, workQueuesSchema,
  type SchoolQueueKey, type WorkQueueKey, type queueListQuery,
} from "@madrasty/contracts";
import type { z } from "zod";
import { ApiError } from "@/server/http";
import { withActor, type ActorContext, type Transaction } from "@/server/db/scoped";

const eligibleSql = {
  guardian_links: "students.manage",
  family_imports: "students.manage",
  class_assignments: null,
  bounced_invites: null,
  unapproved_attendance: "attendance.supervise",
  noncontinuation_requests: null,
  settlement_review: null,
} satisfies Record<WorkQueueKey,string|null>;
const keys=Object.keys(eligibleSql) as WorkQueueKey[];
const priority = [
  "unapproved_attendance", "bounced_invites", "noncontinuation_requests",
  "settlement_review", "guardian_links", "class_assignments", "family_imports",
] satisfies WorkQueueKey[];

async function visibleKeys(tx:Transaction) {
  const rows=await tx<{key:WorkQueueKey;allowed:boolean}[]>`
    select candidate.key, case candidate.key
      when 'class_assignments' then app.staff_editor()
      when 'bounced_invites' then app.has_capability('students.manage') or app.has_capability('staff.invite')
      when 'noncontinuation_requests' then app.enrollment_stop_staff()
      when 'settlement_review' then app.finance_receipt_staff()
      else app.has_capability(candidate.capability)
    end as allowed
    from unnest(${tx.array(keys)}::text[],${tx.array(keys.map(key=>eligibleSql[key]))}::text[]) with ordinality as candidate(key,capability,ord)
    order by array_position(${tx.array(priority)}::text[], candidate.key)`;
  return rows.filter(entry=>entry.allowed).map(entry=>entry.key);
}

function source(tx:Transaction,key:WorkQueueKey,asOf:string) {
  return schoolQueueKeySchema.safeParse(key).success
    ? tx`app.work_queue_items(${key},${asOf}::date)`
    : tx`app.dashboard_work_queue_items(${key},${asOf}::date)`;
}

async function schoolDate(tx: Transaction, requested?: string) {
  const [date]=await tx<{asOf:string;today:string;timezone:string}[]>`
    select coalesce(${requested??null}::date,app.school_today())::text as "asOf",
      app.school_today()::text as today,timezone from app.timetable_week_info(${requested??null}::date)`;
  return date;
}

export async function readWorkQueues(actor: ActorContext, asOf?: string) {
  return withActor(actor,async(tx)=>{
    const date=await schoolDate(tx,asOf);
    if(!date){
      const [setup]=await tx<{allowed:boolean}[]>`select app.has_capability('school.manage') as allowed`;
      return workQueuesSchema.parse({asOf:null,today:null,timezone:null,setupRequired:true,mayConfigure:setup.allowed,queues:[]});
    }
    const eligible=actor.persona==="admin"?(await visibleKeys(tx)).filter(key=>key!=="noncontinuation_requests"):[];
    const queues=[];
    for(const key of eligible){
      const target={key,route:`/school/home/queues/${key}`,filters:{asOf:date.asOf}};
      try{
        const count=await tx.savepoint(async scoped=>{
          const [result]=await scoped<{count:number}[]>`select count(*)::int as count from ${source(scoped,key,date.asOf)}`;
          return result.count;
        });
        queues.push({...target,state:"ready",count});
      }catch{
        queues.push({...target,state:"unavailable"});
      }
    }
    const [overview] = actor.persona === "admin" ? await tx`
      select
        case when app.has_capability('students.manage') then
          (select count(*)::int from app.student where state = 'active') end as students,
        case when app.staff_editor() or app.has_capability('students.manage') then
          (select count(*)::int from app.school_class c join app.school_year y on y.id = c.year_id
           where ${date.today}::date >= y.starts_on and ${date.today}::date < y.ends_exclusive and y.state <> 'closed') end as classes,
        case when app.staff_editor() then
          (select count(*)::int from app.staff_profile p where p.role = 'teacher' and p.disabled_at is null
           and p.active_from <= ${date.today}::date and (p.active_until is null or ${date.today}::date < p.active_until)) end as teachers,
        app.has_capability('comms.publish') as "mayPublish",
        app.has_capability('finance.issue') as "mayIssue"
    ` : [];
    let schoolDays:Record<string,unknown>|undefined, finance:Record<string,unknown>|undefined;
    if(actor.persona==="admin"){
      // Keep the home usable even while an additive migration is rolling out.
      try{schoolDays=await tx.savepoint(async scoped=>{
        const [row]=await scoped<{value:Record<string,unknown>|null}[]>`select app.admin_start_school_days() as value`;
        return row?.value??undefined;
      });}catch{/* Optional projection is unavailable, never invent zero values. */}
      try{finance=await tx.savepoint(async scoped=>{
        const [row]=await scoped`select to_char(f.school_month,'YYYY-MM') as month,f.currency,
          (m.value->>'cash')::bigint::float8 as cash,(m.value->>'bank')::bigint::float8 as bank
          from app.finance_overview(app.billing_school_month()) f
          cross join lateral jsonb_array_elements(f.months) m(value)
          where m.value->>'month'=to_char(f.school_month,'YYYY-MM')`;
        return row;
      });}catch{/* Finance unavailable. */}
    }
    return workQueuesSchema.parse({...date,queues,overview:overview?{...overview,...schoolDays,finance}:undefined});
  });
}

export function readWorkQueue(actor: ActorContext,key: WorkQueueKey,input: z.infer<typeof queueListQuery>) {
  return withActor(actor,async(tx)=>{
    if(actor.persona!=="admin" || !(await visibleKeys(tx)).includes(key))throw new ApiError("not_found");
    const date=await schoolDate(tx,input.asOf);
    if(!date)throw new ApiError("not_found");
    const records=queueItemSchema.array().parse(await tx`
      select id,title_ar as "titleAr",title_de as "titleDe",detail_ar as "detailAr",detail_de as "detailDe",target
      from ${source(tx,key,date.asOf)}
      where (${input.cursor??null}::uuid is null or id>${input.cursor??null}::uuid)
      order by id limit ${input.limit+1}`);
    return {page:queuePageSchema.parse({asOf:date.asOf,items:records.slice(0,input.limit)}),
      nextCursor:records.length>input.limit?records[input.limit-1].id:undefined};
  });
}
