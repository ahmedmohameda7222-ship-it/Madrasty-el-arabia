import "server-only";
import {stopRefundReceipt,stopReviewDetail,stopReviewSummary,type stopRefund,type stopResolution,type stopReviewQuery} from "@madrasty/contracts";
import {z} from "zod";
import {requireCapability} from "@/server/access/policies";
import {commitCommand,hashCommand} from "@/server/db/commands";
import {appendAudit,appendEvent} from "@/server/db/outbox";
import {withActor,type ActorContext,type Transaction} from "@/server/db/scoped";
import {ApiError} from "@/server/http";

const utc="YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"";
const position=z.object({id:z.uuid(),openedAt:z.iso.datetime()});
const fields=(tx:Transaction)=>tx`id,stop_id as "stopId",student_id as "studentId",student_name as "studentName",student_number as "studentNumber",
  invoice_id as "invoiceId",invoice_number as "invoiceNumber",to_char(period,'YYYY-MM') as period,kind,currency,
  original_minor::float8 as "originalMinor",collectible_minor::float8 as "collectibleMinor",
  original_allocated_minor::float8 as "originalAllocatedMinor",current_allocated_minor::float8 as "currentAllocatedMinor",state,revision,
  to_char(opened_at at time zone 'UTC',${utc}) as "openedAt",to_char(resolved_at at time zone 'UTC',${utc}) as "resolvedAt"`;

export function listStopReviews(actor:ActorContext,input:z.infer<typeof stopReviewQuery>){
  let after:z.infer<typeof position>|null=null;
  if(input.cursor){
    try{after=position.parse(JSON.parse(Buffer.from(input.cursor,"base64url").toString("utf8")));}
    catch{throw new ApiError("validation",{cursor:"error.validation"});}
  }
  return withActor(actor,async(tx)=>{
    const [scope]=await tx<{allowed:boolean}[]>`select app.finance_receipt_staff() as allowed`;
    if(!scope.allowed)throw new ApiError("forbidden");
    const rows=stopReviewSummary.array().parse(await tx`select ${fields(tx)}
      from app.stop_review_rows(null,${input.status??null}::text,false) r
      where (${after?.id??null}::uuid is null or (r.opened_at,r.id)<(${after?.openedAt??null}::timestamptz,${after?.id??null}::uuid))
      order by r.opened_at desc,r.id desc limit ${input.limit+1}`);
    const items=rows.slice(0,input.limit),last=items.at(-1);
    return {items,nextCursor:rows.length>input.limit&&last?Buffer.from(JSON.stringify(position.parse(last))).toString("base64url"):undefined};
  });
}

async function readReview(tx:Transaction,id:string){
  const [row]=await tx`select ${fields(tx)},reason,can_post as "canPost",funds,evidence,adjustment_id as "adjustmentId"
    from app.stop_review_rows(${id},null,true)`;
  if(!row)throw new ApiError("not_found");
  return stopReviewDetail.parse(row);
}
export const loadStopReview=(actor:ActorContext,id:string)=>withActor(actor,(tx)=>readReview(tx,id));

async function authorizeReview(tx:Transaction,actor:ActorContext,id:string){
  await requireCapability(tx,actor,"finance.post");
  const [scope]=await tx<{allowed:boolean}[]>`select app.stop_review_can_post(${id}) as allowed`;
  if(!scope.allowed)throw new ApiError("not_found");
}

export async function saveStopRefund(actor:ActorContext,id:string,key:string|null,input:z.infer<typeof stopRefund>){
  const result=await commitCommand(actor,"finance.stop.refund",key,hashCommand({id,...input}),{
    authorize:(tx)=>authorizeReview(tx,actor,id),
    mutate:async(tx)=>{
      const [row]=await tx`select refund_id as "refundId",revision from app.record_stop_refund(${id},${input.revision},
        ${input.receiptId},${input.externalRefundRef},${input.refundedDate}::date,${input.amountMinor}::bigint,${input.verified})`;
      if(!row)throw new ApiError("stale_revision");
      const outcome=stopRefundReceipt.parse(row),review=await readReview(tx,id);
      await appendAudit(tx,{action:"finance.stop_refund_recorded",aggregateId:outcome.refundId,
        metadata:{reviewId:id,receiptId:input.receiptId,revision:outcome.revision}});
      await appendEvent(tx,{type:"finance.stop_refund_recorded",aggregateId:outcome.refundId,actorId:actor.accountId,
        payload:{reviewId:id,invoiceId:review.invoiceId,studentId:review.studentId,refundId:outcome.refundId}});
      return outcome;
    },
  });
  return result.data;
}

export async function completeStopReview(actor:ActorContext,id:string,key:string|null,input:z.infer<typeof stopResolution>){
  await commitCommand(actor,"finance.stop.resolve",key,hashCommand({id,...input}),{
    authorize:(tx)=>authorizeReview(tx,actor,id),
    mutate:async(tx)=>{
      const refs=[...(input.receiptOrAdjustmentRef?[input.receiptOrAdjustmentRef]:[]),...(input.references??[])];
      const [row]=await tx<{revision:number}[]>`select revision from app.resolve_stop_review(${id},${input.revision},
        ${input.resolution},${refs}::uuid[],${input.reason})`;
      if(!row)throw new ApiError("stale_revision");
      const review=await readReview(tx,id);
      await appendAudit(tx,{action:"finance.stop_review_resolved",aggregateId:id,
        metadata:{revision:row.revision,invoiceId:review.invoiceId,adjustmentId:review.adjustmentId}});
      await appendEvent(tx,{type:"finance.stop_review_resolved",aggregateId:id,actorId:actor.accountId,
        payload:{reviewId:id,invoiceId:review.invoiceId,studentId:review.studentId,revision:row.revision}});
      return row;
    },
  });
  return loadStopReview(actor,id);
}
