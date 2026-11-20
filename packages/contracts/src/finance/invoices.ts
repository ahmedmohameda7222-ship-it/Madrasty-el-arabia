import {z} from "zod";
import {pageQuerySchema,revisionSchema,schoolDateSchema} from "../http";
import {transferInstructions} from "./bank";

export const billingMonth=z.string().regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/).refine((value)=>!value.startsWith("0000"));
const id=z.uuid(),currency=z.string().regex(/^[A-Z]{3}$/),count=z.int().min(0),dueDay=z.int().min(1).max(31);
const translatedTitle=z.string().trim().min(1).max(120);
export const feeLine=z.object({titleAr:translatedTitle,titleDe:translatedTitle,amountMinor:z.int().min(1).max(1000000000000)});
const invoiceLines=feeLine.array().min(1).max(20);
export const feeTariffInput=z.object({effectiveFromMonth:billingMonth,lines:invoiceLines,dueDay});
export const feeTariff=feeTariffInput.extend({id,currency,createdAt:z.iso.datetime()});
export const tariffQuery=pageQuerySchema.extend({cursor:billingMonth.optional()});
export const payerEdit=z.object({guardianId:id,effectiveFromMonth:billingMonth,revision:count});
const pupil=z.object({id,studentNumber:z.string(),studentName:z.string()});
export const payerProfile=z.object({
  studentId:id,studentNumber:z.string(),studentName:z.string(),revision:count,
  choices:z.object({id,displayName:z.string(),activeAccount:z.boolean()}).array(),
  designations:payerEdit.extend({guardianName:z.string()}).array(),
});
export const billingOptionsQuery=z.object({period:billingMonth.optional()});
export const billingOptions=z.object({
  schoolMonth:billingMonth,period:billingMonth,currency:currency.nullable(),dueDay:dueDay.nullable(),bankReady:z.boolean(),
  classes:z.object({id,code:z.string(),nameAr:z.string(),nameDe:z.string()}).array(),
});
export const billingPupil=pupil;
export const billingPupilQuery=pageQuerySchema.extend({
  period:billingMonth,classId:id.optional(),q:z.string().trim().max(100).optional(),
  missing:z.enum(["true","false"]).default("false"),cursor:id.optional(),
});
export const invoiceKind=z.enum(["monthly","manual"]);
const selection={period:billingMonth,classId:id.optional(),dueDate:schoolDateSchema.optional()};
export const invoicePreviewInput=z.discriminatedUnion("kind",[
  z.object({...selection,kind:z.literal("monthly"),studentIds:id.array().min(1).max(1000).optional()}).strict(),
  z.object({...selection,kind:z.literal("manual"),studentIds:z.tuple([id]),chargeSourceId:id,lineItems:invoiceLines}).strict(),
]).refine((value)=>!value.studentIds||new Set(value.studentIds).size===value.studentIds.length,{path:["studentIds"]});
export const previewOutcome=z.enum([
  "ready","existing","stopped","not_enrolled","payer_missing","payer_inactive","bank_missing","tariff_missing","currency_mismatch","monthly_charge",
]);
export const invoicePreviewRow=z.object({
  studentId:id,studentNumber:z.string(),studentName:z.string(),payerId:id.nullable(),payerName:z.string().nullable(),
  bankVersionId:id.nullable(),tariffId:id.nullable(),currency:currency.nullable(),dueDate:schoolDateSchema.nullable(),
  lines:feeLine.array(),totalMinor:count,reference:z.string().nullable(),existingId:id.nullable(),outcome:previewOutcome,
});
export const invoicePreview=z.object({
  previewId:id,revision:revisionSchema,expiresAt:z.iso.datetime(),period:billingMonth,kind:invoiceKind,rows:invoicePreviewRow.array(),
});
export const invoiceConfirm=z.object({previewId:id,revision:revisionSchema});
export const invoiceBatch=z.object({
  batchId:id,issuedIds:id.array(),existingIds:id.array(),
  skipped:z.object({studentId:id,reason:previewOutcome}).array(),
});
export const invoiceState=z.enum(["unpaid","partial","paid","cancelled"]);
export const invoiceQuery=pageQuerySchema.extend({
  period:billingMonth.optional(),studentId:id.optional(),state:invoiceState.optional(),q:z.string().trim().max(100).optional(),
});
export const invoiceSummary=z.object({
  id,invoiceNumber:z.string(),studentId:id,studentNumber:z.string(),studentName:z.string(),payerName:z.string(),
  period:billingMonth,kind:invoiceKind,dueDate:schoolDateSchema,currency,totalMinor:count,
  allocatedMinor:count,balanceMinor:count,state:invoiceState,issuedAt:z.iso.datetime(),cancelledAt:z.iso.datetime().nullable(),
  revision:revisionSchema,
});
export const invoiceDetail=invoiceSummary.extend({
  lines:invoiceLines,paymentInstructions:transferInstructions.nullable(),issueInstructions:transferInstructions,
  receiptIds:id.array(),canInquire:z.boolean(),
});
export type InvoicePreview=z.infer<typeof invoicePreview>;
export type InvoiceDetail=z.infer<typeof invoiceDetail>;
export type FeeLine=z.infer<typeof feeLine>;
