import "server-only";
import {
  receiptMutation,receiptOptions,receiptPayerDetail,receiptPosting,receiptStaffDetail,receiptSummary,receiptRefundInput,receiptRefundResult,
  type receiptQuery,type recordReceiptInput,
} from "@madrasty/contracts";
import {z} from "zod";
import {requireCapability} from "@/server/access/policies";
import {commitCommand,hashCommand} from "@/server/db/commands";
import {appendAudit,appendEvent} from "@/server/db/outbox";
import {withActor,type ActorContext,type Transaction} from "@/server/db/scoped";
import {ApiError} from "@/server/http";

const time="YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"";
const cursorSchema=z.object({id:z.uuid(),recordedAt:z.iso.datetime()});
function readReceiptCursor(value?:string){
  if(!value)return null;
  try{return cursorSchema.parse(JSON.parse(Buffer.from(value,"base64url").toString("utf8"))); }
  catch{throw new ApiError("validation",{cursor:"error.validation"});}
}
const summary=(tx:Transaction)=>tx`id,receipt_number as "receiptNumber",method,received_date::text as "receivedDate",currency,
  amount_minor::float8 as "amountMinor",active_minor::float8 as "activeMinor",applied_minor::float8 as "appliedMinor",
  remainder_minor::float8 as "remainderMinor",state,to_char(recorded_at at time zone 'UTC',${time}) as "recordedAt",revision`;

export function loadReceiptOptions(actor:ActorContext){
  return withActor(actor,async(tx)=>{
    await requireCapability(tx,actor,"finance.post");
    const [row]=await tx`select school_date::text as "schoolDate",currency,cash_enabled as "cashEnabled" from app.finance_receipt_options()`;
    if(!row)throw new ApiError("unavailable");
    return receiptOptions.parse(row);
  });
}

export function listReceipts(actor:ActorContext,input:z.infer<typeof receiptQuery>){
  const after=readReceiptCursor(input.cursor);
  return withActor(actor,async(tx)=>{
    const [scope]=await tx<{allowed:boolean}[]>`select app.finance_receipt_staff() as allowed`;
    if(!scope.allowed)throw new ApiError("forbidden");
    const rows=receiptSummary.array().parse(await tx`select ${summary(tx)}
      from app.receipt_staff_rows(null,${input.state??null}::text,${after?.recordedAt??null}::timestamptz,
        ${after?.id??null}::uuid,${input.limit+1},false)`);
    const items=rows.slice(0,input.limit),last=items.at(-1);
    return {items,nextCursor:rows.length>input.limit&&last?Buffer.from(JSON.stringify(cursorSchema.parse(last))).toString("base64url"):undefined};
  });
}

export function loadReceipt(actor:ActorContext,id:string){
  return withActor(actor,async(tx)=>{
    if(actor.persona==="guardian"){
      const [row]=await tx`select id,receipt_number as "receiptNumber",method,received_date::text as "receivedDate",currency,
        to_char(recorded_at at time zone 'UTC',${time}) as "recordedAt",original_minor::float8 as "amountMinor",
        applied_minor::float8 as "appliedMinor",allocations
        from app.receipt_payer_document(${id})`;
      if(!row)throw new ApiError("not_found");
      const [refunds]=await tx`select app.receipt_refund_details(${id}) as refunds`;
      return receiptPayerDetail.parse({...row,scope:"payer",refunds:refunds.refunds});
    }
    const [row]=await tx`select ${summary(tx)},external_ref as "externalReceiptRef",suggested_invoice_id as "suggestedInvoiceId",
      allocations,history,can_post as "canPost" from app.receipt_staff_rows(${id},null,null,null,1,true)`;
    if(!row)throw new ApiError("not_found");
    const [refunds]=await tx`select app.receipt_refund_details(${id}) as refunds`;
    return receiptStaffDetail.parse({...row,scope:"staff",refunds:refunds.refunds});
  });
}

export async function requireReceiptPosting(tx:Transaction,actor:ActorContext,receiptId?:string,invoiceIds:string[]=[]){
  await requireCapability(tx,actor,"finance.post");
  if(receiptId){
    const [row]=await tx<{allowed:boolean}[]>`select app.finance_receipt_posting_target(${receiptId}) as allowed`;
    if(!row.allowed)throw new ApiError("not_found");
  }
  if(invoiceIds.length){
    const [row]=await tx<{allowed:boolean}[]>`select bool_and(app.finance_receipt_invoice_target(i.id)) as allowed
      from unnest(${invoiceIds}::uuid[]) i(id)`;
    if(!row.allowed)throw new ApiError("not_found");
  }
}

export type MutationRow={id:string;receiptNumber:string;remainderMinor:number;revision:number;posting:unknown};
export const receiptMutationFields=(tx:Transaction)=>tx`receipt_id as id,receipt_number as "receiptNumber",
  remainder_minor::float8 as "remainderMinor",revision,posting`;
export async function finalizeReceiptPosting(tx:Transaction,actor:ActorContext,row?:MutationRow){
  if(!row)throw new ApiError("stale_revision");
  const posting=receiptPosting.parse(row.posting);
  const reversed=posting.kind==="unapply"||posting.kind==="void_receipt";
  const items=posting.items.map(({balanceMinor,...item})=>item);
  await appendEvent(tx,{type:reversed?"payment.reversed":"payment.recorded",aggregateId:row.id,actorId:actor.accountId,
    payload:{...posting,items}});
  await appendAudit(tx,{
    action:reversed?"finance.receipt_reversed":posting.kind==="record"?"finance.receipt_recorded":"finance.receipt_allocated",
    aggregateId:row.id,metadata:{postingId:posting.postingId,kind:posting.kind,revision:row.revision,affectedCount:items.length},
  });
  return receiptMutation.parse({...row,items:posting.items,
    state:posting.kind==="void_receipt"?"voided":row.remainderMinor>0?"needs_matching":"allocated"});
}

export async function recordReceipt(actor:ActorContext,key:string|null,input:z.infer<typeof recordReceiptInput>){
  const recorded=await commitCommand(actor,"finance.receipt.record",key,hashCommand(input),{
    authorize:(tx)=>requireReceiptPosting(tx,actor,undefined,input.allocations?.map(line=>line.invoiceId)??(input.invoiceId?[input.invoiceId]:[])),
    mutate:async(tx)=>{
      const [row]=await tx<MutationRow[]>`select ${receiptMutationFields(tx)}
        from app.record_finance_receipt(${input.externalReceiptRef},${input.method},${input.receivedDate}::date,
          ${input.currency},${input.amountMinor}::bigint,${input.invoiceId??null}::uuid,${input.verified})`;
      const receipt=await finalizeReceiptPosting(tx,actor,row);
      if(!input.allocations)return receipt;
      const [allocated]=await tx<MutationRow[]>`select ${receiptMutationFields(tx)}
        from app.allocate_finance_receipt(${receipt.id},${receipt.revision},${tx.json(input.allocations)})`;
      return finalizeReceiptPosting(tx,actor,allocated);
    },
  });
  return recorded.data;
}

export async function refundReceipt(actor:ActorContext,id:string,key:string|null,input:z.infer<typeof receiptRefundInput>){
  const result=await commitCommand(actor,"finance.receipt.refund",key,hashCommand({id,...input}),{
    authorize:tx=>requireReceiptPosting(tx,actor,id),
    mutate:async tx=>{
      const [row]=await tx`select id,revision,reversal_posting as "reversalPosting",allocation_posting as "allocationPosting"
        from app.record_receipt_refund(${id},${input.revision},${input.allocationId??null},${input.refundedDate}::date,
          ${input.amountMinor}::bigint,${input.externalRefundRef},${input.reason},${input.verified})`;
      if(!row)throw new ApiError("stale_revision");
      const changed=receiptRefundResult.parse(row);
      // The physical refund and allocation journal are already committed atomically within this transaction.
      // Notify the affected payer using the existing immutable posting events.
      for(const value of [row.reversalPosting,row.allocationPosting]){
        if(value===null)continue;
        const posting=receiptPosting.parse(value);
        const items=posting.items.map(({balanceMinor,...item})=>item);
        await appendEvent(tx,{type:posting.kind==="unapply"?"payment.reversed":"payment.recorded",aggregateId:id,actorId:actor.accountId,
          payload:{...posting,items}});
      }
      await appendAudit(tx,{action:"finance.receipt_refunded",aggregateId:id,metadata:{refundId:changed.id,revision:changed.revision,amountMinor:input.amountMinor}});
      return changed;
    }
  });
  return result.data;
}
