import "server-only";
import {
  queueItemSchema, queuePageSchema, schoolQueueKeySchema, workQueuesSchema,
  type SchoolQueueKey, type WorkQueueKey, type queueListQuery,
} from "@madrasty/contracts";
import type { z } from "zod";
import { ApiError } from "@/server/http";
import { withActor, type ActorContext, type Transaction } from "@/server/db/scoped";

type QueueSource = {
  key: WorkQueueKey;
  eligible: (tx: Transaction) => Promise<boolean>;
  count: (tx: Transaction, asOf: string) => Promise<number>;
};

function schoolQueue(key: SchoolQueueKey, eligibility: "students.manage" | "school") : QueueSource {
  return {
    key,
    eligible: async (tx)=>{
      const [result]=eligibility==="school"
        ? await tx<{allowed:boolean}[]>`select app.staff_editor() as allowed`
        : await tx<{allowed:boolean}[]>`select app.has_capability('students.manage') as allowed`;
      return result.allowed;
    },
    count:async(tx,asOf)=>{
      const [result]=await tx<{count:number}[]>`select count(*)::int as count from app.work_queue_items(${key},${asOf}::date)`;
      return result.count;
    },
  };
}

// D01 supplies eligible source queries for these module-owned queues. Missing queries remain hidden.
export const moduleQueueSlots = {
  bounced_invites: "identity",
  unapproved_attendance: "attendance",
  noncontinuation_requests: "enrollment",
  settlement_review: "finance",
  failed_deliveries: "communications",
} as const;
const integratedModuleQueues: QueueSource[]=[];
const sources: QueueSource[]=[
  schoolQueue("guardian_links","students.manage"),
  schoolQueue("family_imports","students.manage"),
  schoolQueue("class_assignments","school"),
  ...integratedModuleQueues,
];

async function schoolDate(tx: Transaction, requested?: string) {
  const [date]=await tx<{asOf:string;today:string;timezone:string}[]>`
    select coalesce(${requested??null}::date,app.school_today())::text as "asOf",
      app.school_today()::text as today,timezone from app.timetable_week_info(${requested??null}::date)`;
  if(!date?.today)throw new ApiError("unavailable");
  return date;
}

export async function readWorkQueues(actor: ActorContext, asOf?: string) {
  const summary=await withActor(actor,async(tx)=>{
    const date=await schoolDate(tx,asOf);
    const eligible:QueueSource[]=[];
    if(actor.persona==="admin"){
      for(const source of sources)if(await source.eligible(tx))eligible.push(source);
    }
    return {date,eligible};
  });
  const queues=await Promise.all(summary.eligible.map(async(source)=>{
    const target={key:source.key,route:`/school/home/queues/${source.key}`,filters:{asOf:summary.date.asOf}};
    try{
      const count=await withActor(actor,async(tx)=>{
        if(!await source.eligible(tx))throw new ApiError("not_found");
        return source.count(tx,summary.date.asOf);
      });
      return {...target,state:"ready",count};
    }catch(error){
      if(error instanceof ApiError && ["not_found","forbidden","unauthenticated"].includes(error.code))return null;
      return {...target,state:"unavailable"};
    }
  }));
  return workQueuesSchema.parse({...summary.date,queues:queues.filter((item)=>item!==null)});
}

export function readWorkQueue(actor: ActorContext,key: WorkQueueKey,input: z.infer<typeof queueListQuery>) {
  return withActor(actor,async(tx)=>{
    const source=actor.persona==="admin"&&sources.find((candidate)=>candidate.key===key);
    if(!source || !schoolQueueKeySchema.safeParse(key).success || !await source.eligible(tx))throw new ApiError("not_found");
    const date=await schoolDate(tx,input.asOf);
    const records=queueItemSchema.array().parse(await tx`
      select id,title_ar as "titleAr",title_de as "titleDe",detail_ar as "detailAr",detail_de as "detailDe",target
      from app.work_queue_items(${key},${date.asOf}::date)
      where (${input.cursor??null}::uuid is null or id>${input.cursor??null}::uuid)
      order by id limit ${input.limit+1}`);
    return { page:queuePageSchema.parse({asOf:date.asOf,items:records.slice(0,input.limit)}),
      nextCursor:records.length>input.limit?records[input.limit-1].id:undefined };
  });
}
