import "server-only";
import {
  financeReportClock,financeReportSummary,financeStatementEntry,financeTotals,
  type FinanceReportQuery,type FinanceStatementEntry,type financeStatementQuery,
} from "@madrasty/contracts";
import {z} from "zod";
import {requireCapability} from "@/server/access/policies";
import {hashCommand} from "@/server/db/commands";
import {appendAudit} from "@/server/db/outbox";
import {withActor,type ActorContext,type Transaction} from "@/server/db/scoped";
import {ApiError} from "@/server/http";

const utc="YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"";
const position=financeStatementEntry.pick({id:true,kind:true,occurredAt:true}).extend({
  cutoff:z.iso.datetime(),fingerprint:z.string().length(64),
});
type Position=z.infer<typeof position>;
type Clock=z.infer<typeof financeReportClock>;
function decodePosition(encoded?:string){
  if(!encoded)return null;
  try{return position.parse(JSON.parse(Buffer.from(encoded,"base64url").toString("utf8"))); }
  catch{throw new ApiError("validation",{cursor:"error.validation"});}
}
async function readClock(tx:Transaction,actor:ActorContext,params:FinanceReportQuery,after?:Position|null){
  if(actor.persona==="teacher"||actor.persona==="guardian"&&params.classId)throw new ApiError("forbidden");
  const [row]=await tx`select school_date::text as "schoolDate",as_of::text as "asOf",
    to_char(cutoff at time zone 'UTC',${utc}) as cutoff,scope,can_export as "canExport"
    from app.finance_reporting_clock(${params.asOf??null}::date,${after?.cutoff??params.cutoff??null}::timestamptz)`;
  if(!row){
    if(actor.persona==="admin"){
      const [allowed]=await tx<{allowed:boolean}[]>`select app.finance_receipt_staff() as allowed`;
      if(!allowed.allowed)throw new ApiError("forbidden");
    }
    throw new ApiError("validation",{asOf:"error.validation"});
  }
  return financeReportClock.parse(row);
}
const queryArgs=(tx:Transaction,clock:Clock,params:FinanceReportQuery)=>tx`${clock.cutoff}::timestamptz,${clock.asOf}::date,
  ${params.period?params.period+"-01":null}::date,${params.classId??null}::uuid,${params.studentId??null}::uuid,${params.status??null}::text,
  ${params.receivedFrom??null}::date,${params.receivedThrough??null}::date`;

export function readFinanceSummary(actor:ActorContext,filters:FinanceReportQuery){
  return withActor(actor,async(tx)=>{
    const clock=await readClock(tx,actor,filters);
    const totals=financeTotals.array().parse(await tx`select currency,billed_minor::float8 as "billedMinor",
      collectible_minor::float8 as "collectibleMinor",applied_minor::float8 as "appliedMinor",
      outstanding_minor::float8 as "outstandingMinor",overdue_minor::float8 as "overdueMinor",invoice_count::float8 as "invoiceCount",
      overdue_count::float8 as "overdueCount",received_minor::float8 as "receivedMinor",net_received_minor::float8 as "netReceivedMinor",
      matched_received_minor::float8 as "matchedReceivedMinor",reversed_minor::float8 as "reversedMinor",voided_minor::float8 as "voidedMinor",
      refunded_minor::float8 as "refundedMinor",unmatched_minor::float8 as "unmatchedMinor",receipt_count::float8 as "receiptCount",
      matching_count::float8 as "matchingCount" from app.finance_report_summary(${queryArgs(tx,clock,filters)})`);
    const classes=clock.scope==="staff"?await tx`select id,code,name_ar as "nameAr",name_de as "nameDe",
      year_start::text as "yearStart",year_end::text as "yearEnd"
      from app.finance_report_classes(${filters.period?filters.period+"-01":null}::date)`:[];
    return financeReportSummary.parse({...clock,totals,classes});
  });
}

async function readLines(tx:Transaction,clock:Clock,filters:FinanceReportQuery,limit:number,after?:Position|null){
  return financeStatementEntry.array().parse(await tx`select id,kind,to_char(occurred_at at time zone 'UTC',${utc}) as "occurredAt",
    invoice_id as "invoiceId",invoice_number as "invoiceNumber",student_id as "studentId",student_name as "studentName",
    student_number as "studentNumber",to_char(period,'YYYY-MM') as period,payer_name as "payerName",class_code as "classCode",due_date::text as "dueDate",
    receipt_id as "receiptId",receipt_number as "receiptNumber",received_date::text as "receivedDate",currency,
    amount_minor::float8 as "amountMinor",balance_minor::float8 as "balanceMinor",state
    from app.finance_report_lines(${queryArgs(tx,clock,filters)},${after?.occurredAt??null}::timestamptz,
      ${after?.kind??null}::text,${after?.id??null}::uuid,${limit})`);
}

export function listFinanceStatement(actor:ActorContext,input:z.infer<typeof financeStatementQuery>){
  const {cursor,limit,cutoff,...filters}=input,after=decodePosition(cursor);
  return withActor(actor,async(tx)=>{
    const clock=await readClock(tx,actor,{...filters,cutoff},after);
    const fingerprint=hashCommand({...filters,asOf:clock.asOf});
    if(after&&(after.fingerprint!==fingerprint||after.cutoff!==clock.cutoff||cutoff&&cutoff!==clock.cutoff)){
      throw new ApiError("validation",{cursor:"error.validation"});
    }
    const rows=await readLines(tx,clock,filters,limit+1,after);
    const items=rows.slice(0,limit),last=items.at(-1);
    return {items,nextCursor:rows.length>limit&&last?Buffer.from(JSON.stringify(position.parse({
      ...last,cutoff:clock.cutoff,fingerprint,
    }))).toString("base64url"):undefined};
  });
}

const csvColumns=[
  ["kind","row_type"],["occurredAt","posted_at_utc"],["studentNumber","student_number"],["studentName","student_name"],
  ["payerName","payer_name"],["classCode","billing_class"],["invoiceNumber","invoice_number"],["period","invoice_period"],
  ["dueDate","invoice_due_date"],["receiptNumber","receipt_number"],["receivedDate","payment_received_date"],
  ["currency","currency"],["amountMinor","amount_minor"],["balanceMinor","balance_minor_as_of"],["state","status"],
] as const satisfies readonly (readonly [keyof FinanceStatementEntry,string])[];
function csvCell(value:string|number|null){
  // Spreadsheet formula prefixes remain literal after CSV decoding, including after whitespace.
  const safe=typeof value==="string"&&(/^[\s\uFEFF]*[=+@-]/u.test(value)||/^[\t\r\n]/u.test(value))?"'"+value:String(value??"");
  return '"'+safe.replaceAll('"','""')+'"';
}
export function exportFinanceStatement(actor:ActorContext,filters:FinanceReportQuery){
  return withActor(actor,async(tx)=>{
    await requireCapability(tx,actor,"finance.export");
    const clock=await readClock(tx,actor,filters);
    if(!clock.canExport)throw new ApiError("forbidden");
    const rows=await readLines(tx,clock,filters,25001);
    if(rows.length>25000)throw new ApiError("validation",{period:"error.finance_range"});
    await appendAudit(tx,{action:"finance.statement_exported",aggregateId:crypto.randomUUID(),metadata:{
      ...filters,asOf:clock.asOf,cutoff:clock.cutoff,rowCount:rows.length,
    }});
    const body=[csvColumns.map(([,name])=>csvCell(name)).join(","),
      ...rows.map((entry)=>csvColumns.map(([field])=>csvCell(entry[field])).join(","))].join("\r\n");
    return {name:`madrasty-finance-${clock.asOf}.csv`,body:"\uFEFF"+body+"\r\n"};
  });
}
