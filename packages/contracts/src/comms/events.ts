import {z} from "zod";
import {revisionSchema,schoolDateSchema} from "../http";
import {billingMonth} from "../finance/invoices";
import {stopState} from "../finance/stops";
import {sequenceSchema} from "./messages";

const id=z.uuid(),revision=revisionSchema,schoolDate=schoolDateSchema;
const attendanceStatus=z.enum(["present","late","absent_unexcused","absent_excused"]);
const attendance={studentId:id,classId:id,schoolDate,revision};
const familyLink=z.object({studentId:id,guardianId:id,revision}).strict();
const academic={sourceId:id,studentId:id,classId:id,date:schoolDate,revision};
const publishedResult=z.discriminatedUnion("sourceKind",[
  z.object({...academic,sourceKind:z.literal("exam"),batchId:id,publicationId:id,change:z.enum(["initial","correction"])}).strict(),
  z.object({...academic,sourceKind:z.literal("evaluation"),batchId:id,publicationId:id,change:z.enum(["initial","correction"])}).strict(),
  z.object({...academic,sourceKind:z.literal("homework"),change:z.literal("correction")}).strict(),
  z.object({...academic,sourceKind:z.literal("activity"),change:z.literal("correction")}).strict(),
]);
const stop=z.object({requestId:id,studentId:id,requesterId:id,startMonth:billingMonth,endMonthExclusive:billingMonth.nullable(),
  state:stopState,revision}).strict();
const paymentFields={
  receiptId:id,postingId:id,revision,items:z.object({allocationId:id,invoiceId:id,invoiceRevision:revision,studentId:id,
    payerId:id,payerReceiptId:id}).strict().array(),
};

export const communicationPayloads={
  "family.link_approved":familyLink,
  "family.link_revoked":familyLink,
  "attendance.arrival_confirmed":z.object({...attendance,status:attendanceStatus,precedingExcuse:z.boolean()}).strict(),
  "attendance.unexcused_confirmed":z.object({...attendance,sheetId:id,approvalRevision:revision}).strict(),
  "attendance.corrected":z.object({...attendance,priorStatus:attendanceStatus,status:attendanceStatus,priorEventId:id.nullable(),
    calendarCancelled:z.boolean()}).strict(),
  "broadcast.published":z.object({broadcastId:id}).strict(),
  "chat.message_created":z.object({
    threadId:id,messageId:id,sequence:sequenceSchema.refine((value)=>value!=="0").or(z.int().positive()),
    source:z.literal("human"),
  }).strict(),
  "exam.published":z.object({examId:id,announcementId:id,priorAnnouncementId:id.nullable(),classId:id,offeringId:id,date:schoolDate,
    time:z.string().nullable(),revision,change:z.enum(["initial","reschedule"])}).strict(),
  "result.published":publishedResult,
  "enrollment.stop_requested":stop,
  "enrollment.stop_withdrawn":stop,
  "enrollment.stop_approved":stop,
  "enrollment.stop_rejected":stop,
  "invoice.issued":z.object({invoiceId:id,studentId:id,payerId:id,period:billingMonth,dueDate:schoolDate,revision}).strict(),
  "payment.recorded":z.object({...paymentFields,kind:z.enum(["record","allocate"])}).strict(),
  "payment.reversed":z.object({...paymentFields,kind:z.enum(["unapply","void_receipt"])}).strict(),
  "finance.stop_review_resolved":z.object({reviewId:id,invoiceId:id,studentId:id,revision}).strict(),
  "finance.stop_refund_recorded":z.object({reviewId:id,invoiceId:id,studentId:id,refundId:id}).strict(),
} as const;

export function communicationPayloadSchema(type:string):z.ZodType|undefined{
  if(!Object.hasOwn(communicationPayloads,type))return undefined;
  return communicationPayloads[type as keyof typeof communicationPayloads];
}
