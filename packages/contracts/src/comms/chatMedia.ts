import { z } from "zod";
import { pageQuerySchema,revisionSchema } from "../http";
import { messageAttachment } from "./messages";

const id=z.uuid();
export const photoLimit=10*1024*1024;
export const voiceLimit=8*1024*1024;
export const voiceMaxMilliseconds=180000;
export const voiceSampleRate=16000;
export const mediaKind=z.enum(["photo","voice"]);
export const mediaMime=z.enum(["image/jpeg","audio/wav"]);
export const uploadMediaInput=z.discriminatedUnion("mediaKind",[
  z.object({mediaKind:z.literal("photo"),mime:z.literal("image/jpeg"),bytes:z.int().min(1).max(photoLimit)}),
  z.object({mediaKind:z.literal("voice"),mime:z.literal("audio/wav"),bytes:z.int().min(46).max(voiceLimit)}),
]);
export const mediaUploadGrant=z.object({
  uploadId:id,url:z.url(),expiresAt:z.iso.datetime(),maxBytes:z.int().positive(),maxDurationMs:z.int().positive().nullable(),
});
export const mediaUploadAction=z.object({action:z.enum(["finalize","cancel"])});
export const mediaUploadState=z.discriminatedUnion("state",[
  z.object({state:z.literal("ready"),mediaId:id}),
  z.object({state:z.enum(["staged","processing","failed","cancelled"])}),
]);

const reason=z.string().trim().min(1).max(500);
export const fileMessageReport=z.object({threadId:id,messageId:id,reason});
export const messageReportReceipt=z.object({reportId:id});
export const messageReportState=z.enum(["pending","in_review","resolved","dismissed"]);
export const messageReportAction=z.enum(["none","redact"]);
export const messageReportQuery=pageQuerySchema.extend({state:messageReportState.optional()});
export const messageReportUpdate=z.object({
  state:z.enum(["in_review","resolved","dismissed"]),action:messageReportAction.optional(),revision:revisionSchema,
}).refine((status)=>(status.action!=="redact"||status.state==="resolved")&&(status.state!=="in_review"||!status.action),
  {path:["action"],message:"error.validation"});
export const messageReportEntry=z.object({
  id,threadId:id,messageId:id,state:messageReportState,action:messageReportAction.nullable(),revision:revisionSchema,
  createdAt:z.iso.datetime(),reason:z.string(),messageBody:z.string().nullable(),authorName:z.string().nullable(),
  messageCreatedAt:z.iso.datetime(),attachments:messageAttachment.array(),
});
export type MessageReport=z.infer<typeof messageReportEntry>;
