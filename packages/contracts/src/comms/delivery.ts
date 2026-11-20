import {z} from "zod";
import {pageQuerySchema,revisionSchema} from "../http";

export const deliveryKind=z.enum(["invite_guardian","invite_teacher","broadcast","attendance","academics","finance","school"]);
export const deliveryState=z.enum(["queued","accepted","delivered","failed","bounced","uncertain","suppressed"]);
export const deliveryHistoryQuery=pageQuerySchema.extend({kind:deliveryKind.optional(),state:deliveryState.optional()});
export const deliveryStatusItem=z.object({
  id:z.uuid(),kind:deliveryKind,state:deliveryState,channel:z.enum(["email","push"]),
  dueAt:z.iso.datetime(),createdAt:z.iso.datetime(),updatedAt:z.iso.datetime(),attempts:z.int().nonnegative(),
  revision:revisionSchema,canRedrive:z.boolean(),failure:z.string().max(80).nullable(),
});
export const deliveryRedrive=z.object({revision:revisionSchema});
export const deliveryReceipt=z.object({id:z.uuid(),revision:revisionSchema,state:z.literal("queued")});
export const deliveryCapability=z.object({allowed:z.boolean()});
