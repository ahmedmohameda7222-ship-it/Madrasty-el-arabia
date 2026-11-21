import {z} from "zod";
import {pageQuerySchema,revisionSchema,schoolDateSchema} from "../http";
import {billingMonth} from "./invoices";

const id=z.uuid(),text=z.string(),dateTime=z.iso.datetime(),currency=z.string().regex(/^[A-Z]{3}$/);
const nonnegative=z.int().min(0),positive=z.int().min(1).max(100000000000000);
const lineAmount=z.int().min(1).max(20000000000000);
const externalReference=z.string().trim().min(1).max(160).refine((value)=>!/[\p{Cc}\p{Cf}]/u.test(value));
const reversalReason=z.string().trim().min(3).max(500);
const method=z.enum(["bank","cash"]);
export const receiptState=z.enum(["needs_matching","allocated","voided"]);
export const receiptOptions=z.object({schoolDate:schoolDateSchema,currency,cashEnabled:z.boolean()});
export const recordReceiptInput=z.object({
  externalReceiptRef:externalReference,method,receivedDate:schoolDateSchema,currency,amountMinor:positive,invoiceId:id.optional(),verified:z.literal(true),
}).strict();
const allocateLine=z.object({invoiceId:id,amountMinor:lineAmount,invoiceRevision:revisionSchema}).strict();
export const receiptAllocationInput=z.object({
  revision:revisionSchema,lines:allocateLine.array().min(1).max(100),
}).strict().refine((value)=>new Set(value.lines.map((line)=>line.invoiceId)).size===value.lines.length,{path:["lines"]});
export const receiptReversalInput=z.discriminatedUnion("kind",[
  z.object({kind:z.literal("unapply"),revision:revisionSchema,allocationIds:id.array().min(1).max(100),reason:reversalReason}).strict(),
  z.object({kind:z.literal("void_receipt"),revision:revisionSchema,reason:reversalReason}).strict(),
]).refine((value)=>value.kind!=="unapply"||new Set(value.allocationIds).size===value.allocationIds.length,{path:["allocationIds"]});
export const receiptQuery=pageQuerySchema.extend({state:receiptState.optional()});
const receiptCommon=z.object({id,receiptNumber:text,method,receivedDate:schoolDateSchema,currency,recordedAt:dateTime});
export const receiptSummary=receiptCommon.extend({
  amountMinor:positive,activeMinor:nonnegative,appliedMinor:nonnegative,remainderMinor:nonnegative,state:receiptState,revision:revisionSchema,
});
const allocation= z.object({
  id,invoiceId:id,invoiceNumber:text,studentName:text,studentNumber:text,period:billingMonth,amountMinor:lineAmount,
  postedAt:dateTime,reversedAt:dateTime.nullable(),reason:text.nullable(),invoiceBalanceMinor:nonnegative.nullable(),
});
const postingKind=z.enum(["record","allocate","unapply","void_receipt"]);
const historyItem=z.object({revision:revisionSchema,kind:z.enum([...postingKind.options,"refund"]),reason:text.nullable(),postedAt:dateTime});
export const receiptStaffDetail=receiptSummary.extend({
  scope:z.literal("staff"),externalReceiptRef:externalReference,suggestedInvoiceId:id.nullable(),
  allocations:allocation.array(),history:historyItem.array(),canPost:z.boolean(),
});
export const receiptPayerDetail=receiptCommon.extend({
  scope:z.literal("payer"),amountMinor:nonnegative,appliedMinor:nonnegative,allocations:allocation.array(),
});
export const receiptDetail=z.discriminatedUnion("scope",[receiptStaffDetail,receiptPayerDetail]);
export const receiptPostingItem=z.object({
  allocationId:id,invoiceId:id,invoiceRevision:revisionSchema,studentId:id,payerId:id,payerReceiptId:id,balanceMinor:nonnegative,
});
export const receiptPosting=z.object({
  receiptId:id,postingId:id,revision:revisionSchema,kind:postingKind,items:receiptPostingItem.array(),
});
export const receiptMutation=z.object({
  id,receiptNumber:text,remainderMinor:nonnegative,revision:revisionSchema,state:receiptState,
  items:receiptPostingItem.pick({allocationId:true,invoiceId:true,invoiceRevision:true,balanceMinor:true}).array(),
});
export type ReceiptDetail=z.infer<typeof receiptDetail>;
export type ReceiptStaffDetail=z.infer<typeof receiptStaffDetail>;
