import "server-only";
import {z} from "zod";
import {cashbookMonth,cashMovementInput,cashMovementReversalInput,financeLedgerQuery,financeLedgerEntry} from "@madrasty/contracts";
import {withActor,type ActorContext} from "@/server/db/scoped";
import {requireCapability} from "@/server/access/policies";
import {commitCommand,hashCommand} from "@/server/db/commands";
import {appendAudit} from "@/server/db/outbox";
import {ApiError} from "@/server/http";

export function readCashbook(actor:ActorContext,month?:string){
  return withActor(actor,async(tx)=>{
    const [scope]=await tx<{allowed:boolean;month:string}[]>`select app.finance_receipt_staff() as allowed,to_char(app.billing_school_month(),'YYYY-MM') as month`;
    if(!scope.allowed)throw new ApiError("forbidden");
    const selected=month??scope.month;
    const [row]=await tx`select currency,school_date::text as "schoolDate",opening_minor::float8 as "openingMinor",balance_minor::float8 as "balanceMinor",
      income_minor::float8 as "incomeMinor",expense_minor::float8 as "expenseMinor",deposits_minor::float8 as "depositsMinor",
      refunds_minor::float8 as "refundsMinor",corrections_minor::float8 as "correctionsMinor",closing_minor::float8 as "closingMinor",
      entries,entry_count::float8 as "entryCount",can_post as "canPost" from app.cashbook_month(${selected+"-01"}::date)`;
    if(!row)throw new ApiError("validation");
    return cashbookMonth.parse({...row,month:selected});
  });
}
export async function postCashMovement(actor:ActorContext,key:string|null,input:z.infer<typeof cashMovementInput>){
  const result=await commitCommand(actor,"finance.cashbook.create",key,hashCommand(input),{
    authorize:tx=>requireCapability(tx,actor,"finance.post"),
    mutate:async(tx)=>{
      const [row]=await tx<{id:string}[]>`select app.add_cashbook_movement(${input.date}::date,${input.kind},${input.amountMinor}::bigint,${input.description}) as id`;
      await appendAudit(tx,{action:"finance.cashbook_movement",aggregateId:row.id,metadata:{kind:input.kind,amountMinor:input.amountMinor,date:input.date}});
      return row;
    },
  });
  return result.data;
}

export async function reverseCashMovement(actor:ActorContext,key:string|null,input:z.infer<typeof cashMovementReversalInput>){
  const result=await commitCommand(actor,"finance.cashbook.reverse",key,hashCommand(input),{
    authorize:tx=>requireCapability(tx,actor,"finance.post"),
    mutate:async(tx)=>{
      const [row]=await tx<{id:string|null}[]>`select app.reverse_cashbook_movement(${input.movementId},${input.reason}) as id`;
      if(!row?.id)throw new ApiError("not_found");
      await appendAudit(tx,{action:"finance.cashbook_reversed",aggregateId:row.id,metadata:{movementId:input.movementId}});
      return {id:row.id};
    },
  });
  return result.data;
}

const ledgerCursor=financeLedgerEntry.pick({id:true,date:true,recordedAt:true});
export function listFinanceLedger(actor:ActorContext,input:z.infer<typeof financeLedgerQuery>){
  let after:z.infer<typeof ledgerCursor>|null=null;
  if(input.cursor){try{after=ledgerCursor.parse(JSON.parse(Buffer.from(input.cursor,"base64url").toString("utf8")));}catch{throw new ApiError("validation");}}
  return withActor(actor,async tx=>{
    const [scope]=await tx<{allowed:boolean;month:string}[]>`select app.finance_receipt_staff() as allowed,to_char(app.billing_school_month(),'YYYY-MM') as month`;
    if(!scope.allowed)throw new ApiError("forbidden");
    if(input.month>scope.month)throw new ApiError("validation");
    const rows=financeLedgerEntry.array().parse(await tx`select id,movement_date::text as date,kind,channel,currency,
      signed_minor::float8 as "signedMinor",description,recorded_by as "actorId",
      to_char(recorded_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "recordedAt",
      receipt_id as "receiptId",reversal_of as "reversalOf",can_reverse as "canReverse"
      from app.finance_ledger_page(${input.month+"-01"}::date,${input.channel??null},${input.q||null},${after?.date??null}::date,
        ${after?.recordedAt??null}::timestamptz,${after?.id??null}::uuid,${input.limit+1})`);
    const items=rows.slice(0,input.limit),last=items.at(-1);
    return {items,nextCursor:rows.length>input.limit&&last?Buffer.from(JSON.stringify(ledgerCursor.parse(last))).toString("base64url"):undefined};
  });
}
