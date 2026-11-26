import { z } from "zod";
import { pageQuerySchema } from "../http";

const id=z.uuid();
export const sequenceSchema=z.string().regex(/^(?:0|[1-9][0-9]{0,18})$/)
  .refine((value)=>value.length<19||value<="9223372036854775807");
export const messageSource=z.enum(["human","system"]);
export const reactionEmoji=z.enum(["👍","❤️","😂","😮","😢","🙏"]);
export const reactionInput=z.object({emoji:reactionEmoji.nullable()});
export const messageReaction=z.object({emoji:reactionEmoji,count:z.int().positive(),mine:z.boolean()});
export const messageAttachment=z.object({
  id,kind:z.enum(["photo","voice"]),contentType:z.string(),bytes:z.int().positive(),durationMs:z.int().positive().nullable(),
});
const quote=z.object({
  id,sequence:sequenceSchema,authorName:z.string().nullable(),source:messageSource,preview:z.string().nullable(),
});
export const chatMessage=z.object({
  id,threadId:id,sequence:sequenceSchema,source:messageSource,authorName:z.string().nullable(),body:z.string().nullable(),
  own:z.boolean(),clientMessageId:id.nullable(),createdAt:z.iso.datetime(),replyable:z.boolean(),reply:quote.nullable(),
  attachments:messageAttachment.array(),reactions:messageReaction.array(),counterpartRead:z.boolean().nullable(),
});
export const chatMessagesQuery=pageQuerySchema.pick({limit:true}).extend({
  before:sequenceSchema.optional(),after:sequenceSchema.optional(),q:z.string().trim().max(120).optional(),
}).refine((value)=>!(value.before&&value.after),{path:["after"],message:"error.validation"});
export const postMessageInput=z.object({
  clientMessageId:id,body:z.string().trim().min(1).max(4000).optional(),
  attachmentIds:id.array().max(4).optional(),replyToId:id.optional(),
}).superRefine((value,context)=>{
  if(!value.body&&!value.attachmentIds?.length)context.addIssue({code:"custom",path:["body"],message:"error.validation"});
  if(value.attachmentIds&&value.attachmentIds.length!==new Set(value.attachmentIds).size)
    context.addIssue({code:"custom",path:["attachmentIds"],message:"error.validation"});
});
export const threadReaderState=z.object({readThroughSeq:sequenceSchema,lastSequence:sequenceSchema,archived:z.boolean(),pinned:z.boolean(),muted:z.boolean()});
export const threadReaderInput=threadReaderState.pick({readThroughSeq:true,archived:true,pinned:true,muted:true}).partial()
  .refine((value)=>value.readThroughSeq!==undefined||value.archived!==undefined||value.pinned!==undefined||value.muted!==undefined,{path:["readThroughSeq"],message:"error.validation"});
export type ChatMessage=z.infer<typeof chatMessage>;
