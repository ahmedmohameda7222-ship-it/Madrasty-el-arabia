import {z} from "zod";
import {pageQuerySchema,revisionSchema,schoolDateSchema} from "../http";
import {billingMonth,invoiceKind} from "./invoices";

const id=z.uuid(),text=z.string(),time=z.iso.datetime(),minor=z.int().min(0);
const explanation=z.string().trim().min(3).max(800);
export const stopDuration=z.enum(["one_month","indefinite"]);
export const stopState=z.enum(["pending","withdrawn","approved","rejected"]);
export const stopSubmit=z.object({studentId:id,lastAttendanceMonth:billingMonth,duration:stopDuration,reason:explanation}).strict();
export const stopWithdraw=z.object({action:z.literal("withdraw"),revision:revisionSchema}).strict();
export const stopDecision=z.object({
  decision:z.enum(["approve","reject"]),note:z.string().trim().min(1).max(800).optional(),revision:revisionSchema,
}).strict();
export const stopQuery=pageQuerySchema.extend({studentId:id.optional(),status:stopState.optional()});
export const stopOptions=z.object({schoolMonth:billingMonth,mayDecide:z.boolean()});
const namedStudent={studentId:id,studentNumber:text,studentName:text};
export const enrollmentStop=z.object({
  id,...namedStudent,requesterId:id,lastAttendanceMonth:billingMonth,startMonth:billingMonth,endMonthExclusive:billingMonth.nullable(),
  duration:stopDuration,state:stopState,reason:text,note:text.nullable(),revision:revisionSchema,createdAt:time,resolvedAt:time.nullable(),
  canDecide:z.boolean(),canWithdraw:z.boolean(),
});
export const stopReviewState=z.enum(["open","waived","retained"]);
export const stopReviewQuery=pageQuerySchema.extend({status:stopReviewState.optional()});
export const stopReviewSummary=z.object({
  id,stopId:id,...namedStudent,invoiceId:id,invoiceNumber:text,period:billingMonth,kind:invoiceKind,
  currency:z.string().regex(/^[A-Z]{3}$/),originalMinor:minor,collectibleMinor:minor,originalAllocatedMinor:minor,currentAllocatedMinor:minor,
  state:stopReviewState,revision:revisionSchema,openedAt:time,resolvedAt:time.nullable(),
});
export const stopReviewDetail=stopReviewSummary.extend({
  reason:text.nullable(),canPost:z.boolean(),adjustmentId:id.nullable(),
  funds:z.object({receiptId:id,receiptNumber:text,sourceMinor:minor,activeMinor:minor,refundedMinor:minor,unmatchedMinor:minor}).array(),
  evidence:z.object({id,receiptId:id,kind:z.enum(["reallocation","refund"]),amountMinor:minor,reference:text,recorded:z.boolean()}).array(),
});
export const stopResolution=z.object({
  resolution:z.enum(["waive","retain_manual"]),receiptOrAdjustmentRef:id.optional(),references:id.array().max(99).optional(),
  reason:explanation,revision:revisionSchema,
}).strict().refine((input)=>{
  const all=[...(input.receiptOrAdjustmentRef?[input.receiptOrAdjustmentRef]:[]),...(input.references??[])];
  return new Set(all).size===all.length&&(input.resolution==="waive"||all.length===0);
},{path:["references"]});
export const stopRefund=z.object({
  receiptId:id,externalRefundRef:z.string().trim().min(1).max(160).refine((value)=>!/[\p{Cc}\p{Cf}]/u.test(value)),
  amountMinor:z.int().min(1).max(20000000000000),refundedDate:schoolDateSchema,verified:z.literal(true),revision:revisionSchema,
}).strict();
export const stopRefundReceipt=z.object({refundId:id,revision:revisionSchema});
export type EnrollmentStop=z.infer<typeof enrollmentStop>;
export type StopReviewDetail=z.infer<typeof stopReviewDetail>;
