import {z} from "zod";
import {billingMonth,schoolDateSchema} from "@madrasty/contracts";
export const cashbookKind=z.enum(["income","donation","expense","deposit","opening"]);
const movement=z.enum([...cashbookKind.options,"receipt","refund","correction"]);
export const cashbookInput=z.object({kind:cashbookKind,date:schoolDateSchema,amountMinor:z.int().min(1).max(100000000000000),description:z.string().trim().min(3).max(300)}).strict();
export const cashbookQuery=z.object({month:billingMonth.optional()});
export const cashbookReport=z.object({currency:z.string().regex(/^[A-Z]{3}$/),month:billingMonth,schoolDate:schoolDateSchema,
  openingMinor:z.int(),balanceMinor:z.int(),monthEndMinor:z.int(),incomeMinor:z.int(),expenseMinor:z.int(),depositMinor:z.int(),refundMinor:z.int(),
  correctionMinor:z.int(),entryCount:z.int(),canPost:z.boolean(),canSetOpening:z.boolean(),
  entries:z.object({id:z.uuid(),date:schoolDateSchema,kind:movement,amountMinor:z.int(),description:z.string(),actor:z.string()}).array()});
export const cashbookSaved=z.object({id:z.uuid()});
