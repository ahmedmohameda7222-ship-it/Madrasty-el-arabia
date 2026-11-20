import {z} from "zod";
import {localeSchema,pageQuerySchema} from "../http";

export const broadcastAudienceKind=z.enum(["all_guardians","class_guardians","all_teachers"]);
export const broadcastAudience=z.discriminatedUnion("kind",[
  z.object({kind:z.enum(["all_guardians","all_teachers"])}).strict(),
  z.object({kind:z.literal("class_guardians"),classId:z.uuid()}).strict(),
]);
export const broadcastText=z.object({title:z.string().trim().min(1).max(180),body:z.string().trim().min(1).max(4000)});
export const broadcastCopy=z.object({ar:broadcastText,de:broadcastText});
export const broadcastDraft=z.object({audience:broadcastAudience,copy:broadcastCopy});
const count=z.int().nonnegative();
export const broadcastPreview=broadcastDraft.extend({
  previewId:z.uuid(),expiresAt:z.iso.datetime(),counts:z.object({ar:count,de:count}),
});
export const broadcastPublish=z.object({previewId:z.uuid()});
export const broadcastReceipt=z.object({publicationId:z.uuid(),recipientCount:z.int().positive()});
export const broadcastOptions=z.object({
  schoolWide:z.boolean(),classes:z.object({id:z.uuid(),code:z.string(),nameAr:z.string(),nameDe:z.string()}).array(),
});
export const broadcastSent=z.object({
  id:z.uuid(),audience:broadcastAudience,classAr:z.string().nullable(),classDe:z.string().nullable(),
  copy:broadcastCopy,publishedAt:z.iso.datetime(),recipientCount:count,
  dispatch:z.object({pending:count,queued:count,suppressed:count}),
});
export const broadcastEntry=broadcastText.extend({id:z.uuid(),publishedAt:z.iso.datetime()});
export const broadcastQuery=pageQuerySchema.extend({locale:localeSchema.default("ar")});
export type BroadcastDraft=z.infer<typeof broadcastDraft>;
export type BroadcastAudience=z.infer<typeof broadcastAudience>;
export type BroadcastKind=z.infer<typeof broadcastAudienceKind>;
export type BroadcastPreview=z.infer<typeof broadcastPreview>;
export type BroadcastReceipt=z.infer<typeof broadcastReceipt>;
