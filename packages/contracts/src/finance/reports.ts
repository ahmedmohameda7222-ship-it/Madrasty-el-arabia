import {z} from "zod";
import {pageQuerySchema,schoolDateSchema} from "../http";
import {billingMonth} from "./invoices";

const id=z.uuid(),text=z.string(),time=z.iso.datetime(),currency=z.string().regex(/^[A-Z]{3}$/);
const amount=z.int().min(0),optionalAmount=amount.nullable();
export const financeReportStatus=z.enum(["unpaid","partial","paid","cancelled","overdue"]);
const filters=z.object({
  period:billingMonth.optional(),classId:id.optional(),studentId:id.optional(),status:financeReportStatus.optional(),
  asOf:schoolDateSchema.optional(),cutoff:time.optional(),receivedFrom:schoolDateSchema.optional(),receivedThrough:schoolDateSchema.optional(),
});
const dateRange=(value:z.infer<typeof filters>)=>!value.receivedFrom||!value.receivedThrough||value.receivedFrom<=value.receivedThrough;
export const financeReportQuery=filters.refine(dateRange,{path:["receivedThrough"]});
export const financeStatementQuery=filters.extend(pageQuerySchema.shape).refine(dateRange,{path:["receivedThrough"]});
export const financeTotals=z.object({
  currency,billedMinor:amount,collectibleMinor:amount,appliedMinor:amount,outstandingMinor:amount,overdueMinor:amount,invoiceCount:amount,overdueCount:amount,
  receivedMinor:optionalAmount,netReceivedMinor:optionalAmount,matchedReceivedMinor:amount,reversedMinor:amount,
  voidedMinor:optionalAmount,refundedMinor:optionalAmount,unmatchedMinor:optionalAmount,receiptCount:amount,matchingCount:optionalAmount,
});
export const financeReportClock=z.object({
  schoolDate:schoolDateSchema,asOf:schoolDateSchema,cutoff:time,scope:z.enum(["staff","payer"]),canExport:z.boolean(),
});
export const financeReportSummary=financeReportClock.extend({
  classes:z.object({id,code:text,nameAr:text,nameDe:text,yearStart:schoolDateSchema,yearEnd:schoolDateSchema}).array(),
  totals:financeTotals.array(),
});
export const financeStatementEntry=z.object({
  id,kind:z.enum(["invoice","allocation","reversal","record","void_receipt","adjustment","refund"]),occurredAt:time,
  invoiceId:id.nullable(),invoiceNumber:text.nullable(),studentId:id.nullable(),studentName:text.nullable(),studentNumber:text.nullable(),
  period:billingMonth.nullable(),payerName:text.nullable(),classCode:text.nullable(),dueDate:schoolDateSchema.nullable(),
  receiptId:id.nullable(),receiptNumber:text.nullable(),receivedDate:schoolDateSchema.nullable(),currency,
  amountMinor:amount,balanceMinor:amount,state:z.enum([...financeReportStatus.options,"needs_matching","allocated","voided"]),
});
export type FinanceReportQuery=z.infer<typeof financeReportQuery>;
export type FinanceStatementEntry=z.infer<typeof financeStatementEntry>;
