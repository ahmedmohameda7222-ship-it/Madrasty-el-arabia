import "server-only";
import {
  invoiceBatch,invoiceDetail,invoicePreview,invoicePreviewRow,invoiceSummary,previewOutcome,billingMonth,schoolDateSchema,
  type invoiceConfirm,type invoicePreviewInput,type invoiceQuery,
} from "@madrasty/contracts";
import {z} from "zod";
import {requireCapability} from "@/server/access/policies";
import {commitCommand,hashCommand} from "@/server/db/commands";
import {appendAudit,appendEvents} from "@/server/db/outbox";
import {withActor,type ActorContext,type Transaction} from "@/server/db/scoped";
import {ApiError} from "@/server/http";

const time="YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"";
const position=z.object({id:z.uuid(),issuedAt:z.iso.datetime()});
const previewSource=invoicePreviewRow.omit({totalMinor:true}).array();
const publishedBatch=z.object({
  issued:z.array(z.object({invoiceId:z.uuid(),studentId:z.uuid(),payerId:z.uuid(),period:billingMonth,dueDate:schoolDateSchema,revision:z.int().min(1)})),
  existing:z.uuid().array(),skipped:z.array(z.object({studentId:z.uuid(),reason:previewOutcome})),
});
function readCursor(value?:string){
  if(!value)return null;
  try{return position.parse(JSON.parse(Buffer.from(value,"base64url").toString("utf8")));}
  catch{throw new ApiError("validation",{cursor:"error.validation"});}
}
const fields=(tx:Transaction)=>tx`id,invoice_number as "invoiceNumber",student_id as "studentId",student_number as "studentNumber",
  student_name as "studentName",payer_name as "payerName",to_char(period,'YYYY-MM') as period,kind,due_date::text as "dueDate",
  currency,total_minor::float8 as "totalMinor",allocated_minor::float8 as "allocatedMinor",balance_minor::float8 as "balanceMinor",state,
  to_char(issued_at at time zone 'UTC',${time}) as "issuedAt",to_char(cancelled_at at time zone 'UTC',${time}) as "cancelledAt",revision`;

export function prepareInvoicePreview(actor:ActorContext,input:z.infer<typeof invoicePreviewInput>){
  return withActor(actor,async(tx)=>{
    await requireCapability(tx,actor,"finance.issue");
    const [row]=await tx<{id:string;expiresAt:string;rows:unknown}[]>`
      select preview_id as id,to_char(expires_at at time zone 'UTC',${time}) as "expiresAt",rows
      from app.create_invoice_preview(${tx.json(input)})`;
    return invoicePreview.parse({previewId:row.id,expiresAt:row.expiresAt,revision:1,period:input.period,kind:input.kind,
      rows:previewSource.parse(row.rows).map((item)=>({...item,totalMinor:item.lines.reduce((sum,line)=>sum+line.amountMinor,0)})),
    });
  });
}
export async function issueInvoiceBatch(actor:ActorContext,key:string|null,input:z.infer<typeof invoiceConfirm>){
  const command=await commitCommand(actor,"finance.invoice.batch",key,hashCommand(input),{
    authorize:async(tx)=>{
      await requireCapability(tx,actor,"finance.issue");
      const [row]=await tx<{allowed:boolean}[]>`select app.invoice_preview_owned(${input.previewId}) as allowed`;
      if(!row.allowed)throw new ApiError("not_found");
    },
    mutate:async(tx)=>{
      const [row]=await tx<{id:string;inserted:boolean;receipt:unknown}[]>`
        select batch_id as id,inserted,receipt from app.confirm_invoice_preview(${input.previewId},${input.revision})`;
      if(!row)throw new ApiError("stale_revision");
      const result=publishedBatch.parse(row.receipt);
      if(row.inserted){
        await appendEvents(tx,result.issued.map((invoice)=>({
          type:"invoice.issued",aggregateId:invoice.invoiceId,actorId:actor.accountId,payload:invoice,
        })));
        await appendAudit(tx,{action:"finance.invoice_batch_issued",aggregateId:row.id,
          metadata:{issuedCount:result.issued.length,existingCount:result.existing.length,skippedCount:result.skipped.length}});
      }
      return invoiceBatch.parse({batchId:row.id,issuedIds:result.issued.map((one)=>one.invoiceId),existingIds:result.existing,skipped:result.skipped});
    },
  });
  return command.data;
}
export function loadInvoice(actor:ActorContext,id:string){
  return withActor(actor,async(tx)=>{
    const [row]=await tx`select ${fields(tx)},lines,payment_instructions as "paymentInstructions",issue_instructions as "issueInstructions",
      receipt_ids as "receiptIds",can_inquire as "canInquire" from app.invoice_rows(${id},null,null,null,true)`;
    if(!row)throw new ApiError("not_found");
    return invoiceDetail.parse(row);
  });
}
export function listInvoices(actor:ActorContext,input:z.infer<typeof invoiceQuery>){
  const after=readCursor(input.cursor);
  return withActor(actor,async(tx)=>{
    if(actor.persona==="teacher")throw new ApiError("forbidden");
    if(actor.persona==="admin"){
      const [scope]=await tx<{allowed:boolean}[]>`select app.finance_receipt_staff() or app.has_capability('finance.issue') as allowed`;
      if(!scope.allowed)throw new ApiError("forbidden");
    }
    const rows=invoiceSummary.array().parse(await tx`select ${fields(tx)}
      from app.invoice_rows(null,${input.period?input.period+"-01":null}::date,${input.studentId??null}::uuid,${input.state==="open"?null:input.state??null}::text,false) j
      where (not ${input.state==="open"}::boolean or j.state in ('unpaid','partial'))
        and (${after?.id??null}::uuid is null or (j.issued_at,j.id)<(${after?.issuedAt??null}::timestamptz,${after?.id??null}::uuid))
        and (${input.q||null}::text is null or strpos(lower(j.student_name),lower(${input.q||null}::text))>0
          or strpos(lower(j.student_number),lower(${input.q||null}::text))>0 or strpos(lower(j.invoice_number),lower(${input.q||null}::text))>0)
      order by j.issued_at desc,j.id desc limit ${input.limit+1}`);
    const items=rows.slice(0,input.limit),end=items.at(-1);
    return {items,nextCursor:rows.length>input.limit&&end?Buffer.from(JSON.stringify(position.parse(end))).toString("base64url"):undefined};
  });
}
