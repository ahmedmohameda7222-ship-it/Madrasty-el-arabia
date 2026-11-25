import {z} from "zod";
import {localeSchema,pageQuerySchema,schoolDateSchema} from "../http";

const id=z.uuid();
export const notificationTemplate=z.enum([
  "broadcast","human_message","child_linked","arrival_confirmed","attendance_unexcused","attendance_corrected",
  "exam_scheduled","result_published","result_corrected","invoice_issued","invoice_reminder","payment_recorded",
  "payment_reversed","fee_stop_changed","school_update",
]);
export const noticeTarget=z.discriminatedUnion("kind",[
  z.object({kind:z.enum(["thread","broadcast","child","invoice","receipt","fee_stop"]),id}),
  z.object({kind:z.enum(["exam","evaluation","activity","homework"]),id,childId:id}),
  z.object({kind:z.literal("attendance"),id,childId:id,date:schoolDateSchema}),
]);
export const noticeTargets=noticeTarget.array().max(50);
export const noticeDestination=z.discriminatedUnion("state",[
  z.object({state:z.literal("open"),targets:noticeTargets.min(1)}),
  z.object({state:z.literal("unavailable")}),
]);
export const noticeRecord=z.object({
  id,template:notificationTemplate,title:z.string(),createdAt:z.iso.datetime(),readAt:z.iso.datetime().nullable(),superseded:z.boolean(),
});
export const noticeQuery=pageQuerySchema.extend({unread:z.enum(["1","0","true","false"]).optional(),locale:localeSchema.default("ar")});
export const noticeRead=z.object({read:z.literal(true)});
export const noticeReadReceipt=z.object({id,readAt:z.iso.datetime()});
export const noticeCount=z.object({unread:z.int().nonnegative()});
export const noticeReadAllReceipt=z.object({marked:z.int().nonnegative()});
export type NoticeTarget=z.infer<typeof noticeTarget>;
export type NotificationTemplate=z.infer<typeof notificationTemplate>;

const token=z.string().min(30).max(4096).regex(/^[A-Za-z0-9_:\-]+$/);
const point=z.string().regex(/^[A-Za-z0-9_-]{87}$/);
const secret=z.string().regex(/^[A-Za-z0-9_-]{22}$/);
export const webPushSubscription=z.object({
  endpoint:z.url().max(2048),expirationTime:z.number().int().positive().nullable().default(null),
  keys:z.object({p256dh:point,auth:secret}),
});
export const pushPlatform=z.enum(["web","android"]);
export const pushInstallation=z.object({installationId:id,platform:pushPlatform});
export const pushRegistration=z.discriminatedUnion("platform",[
  z.object({platform:z.literal("web"),installationId:id,sessionId:id,subscription:webPushSubscription}),
  z.object({platform:z.literal("android"),installationId:id,sessionId:id,token}),
]);
export const pushStatus=z.object({enabled:z.boolean()});
export const pushReceipt=z.object({installationId:id,guard:id});
export const pushOptions=z.object({
  web:z.object({publicKey:point}).nullable(),
  android:z.object({
    apiKey:z.string().regex(/^[A-Za-z0-9_-]{20,80}$/),projectId:z.string().regex(/^[a-z][a-z0-9-]{4,62}$/),
    senderId:z.string().regex(/^\d{6,20}$/),firebaseAppId:z.string().regex(/^1:\d{6,20}:android:[a-f0-9]+$/),
  }).nullable(),
});
