import {z} from "zod";
import {billingMonth} from "./invoices";
import {pageQuerySchema,schoolDateSchema} from "../http";
export const cashMovementKind=z.enum(["income","donation","expense","bank_deposit"]);
export const cashMovementInput=z.object({date:schoolDateSchema,kind:cashMovementKind,amountMinor:z.int().min(1).max(100000000000000),description:z.string().trim().min(3).max(500)}).strict();
export const cashMovementReversalInput=z.object({movementId:z.uuid(),reason:z.string().trim().min(3).max(500)}).strict();
export const cashbookQuery=z.object({month:billingMonth.optional()});
export const cashbookEntry=z.object({id:z.uuid(),date:schoolDateSchema,kind:z.enum(["fee","void","refund",...cashMovementKind.options]),signedMinor:z.int(),description:z.string(),actorId:z.uuid(),recordedAt:z.iso.datetime(),receiptId:z.uuid().nullable(),reversalOf:z.uuid().nullable().optional(),canReverse:z.boolean().optional()});
export const cashbookMonth=z.object({month:billingMonth,currency:z.string().regex(/^[A-Z]{3}$/),schoolDate:schoolDateSchema,openingMinor:z.int(),balanceMinor:z.int(),incomeMinor:z.int(),expenseMinor:z.int(),depositsMinor:z.int(),refundsMinor:z.int(),correctionsMinor:z.int(),closingMinor:z.int(),entries:cashbookEntry.array(),entryCount:z.int().nonnegative(),canPost:z.boolean()});
export type CashbookMonth=z.infer<typeof cashbookMonth>;

export const financeLedgerChannel=z.enum(["cash","bank","transfer"]);
export const financeLedgerQuery=pageQuerySchema.extend({month:billingMonth,channel:financeLedgerChannel.optional(),q:z.string().trim().max(100).optional()});
export const financeLedgerEntry=cashbookEntry.extend({channel:financeLedgerChannel,currency:z.string().regex(/^[A-Z]{3}$/)});
export type FinanceLedgerEntry=z.infer<typeof financeLedgerEntry>;
