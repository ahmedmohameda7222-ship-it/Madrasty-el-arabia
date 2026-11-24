import {z} from "zod";
import {billingMonth} from "@madrasty/contracts";
export const monthlyBillingSettings=z.object({enabled:z.boolean(),startsMonth:billingMonth.nullable(),nextMonth:billingMonth,revision:z.int().min(0)});
export const monthlyBillingInput=z.object({enabled:z.boolean(),revision:z.int().min(0)}).strict();
