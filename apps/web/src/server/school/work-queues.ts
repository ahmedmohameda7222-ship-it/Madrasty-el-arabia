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
  failed_deliveries: null,
} satisfies Record<WorkQueueKey,string|null>;
const keys=Object.keys(eligibleSql) as WorkQueueKey[];

async function visibleKeys(tx:Transaction) {
  const rows=await tx<{key:WorkQueueKey;allowed:boolean}[]>`
    select candidate.key, case candidate.key
      when 'class_assignments' then app.staff_editor()
      when 'bounced_invites' then app.has_capability('students.manage') or app.has_capability('applications.manage')
      when 'noncontinuation_requests' then app.enrollment_stop_staff()
      when 'settlement_review' then app.finance_receipt_staff()
      when 'failed_deliveries' then app.may_operate_delivery_queue()
      else app.has_capability(candidate.capability)
    end as allowed
    from unnest(${tx.array(keys)}::text[],${tx.array(keys.map(key=>eligibleSql[key]))}::text[]) with ordinality as candidate(key,capability,ord)
    order by candidate.ord`;
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
    const eligible=actor.persona==="admin"?await visibleKeys(tx):[];
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
    return workQueuesSchema.parse({...date,queues});
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
