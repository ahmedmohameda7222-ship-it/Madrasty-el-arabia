import { z } from "zod";
import { directoryTargetSchema } from "../account";
import { inboxSchema } from "../capabilities";
import { pageQuerySchema,revisionSchema } from "../http";
import { messageSource,sequenceSchema } from "./messages";

const id=z.uuid();
export const threadKind=z.enum(["direct","office"]);
export const caseStatus=z.enum(["open","in_progress","closed"]);
export const threadReference=z.object({kind:z.enum(["homework","invoice","attendance"]),id});
export const startThreadInput=z.object({target:directoryTargetSchema,context:threadReference.optional(),
  firstMessage:z.object({clientMessageId:id,body:z.string().trim().min(1).max(4000)}).optional(),
}).refine(value=>!value.firstMessage||(value.target.kind==="person"&&!value.context),{path:["firstMessage"],message:"error.validation"});
export const threadReceipt=z.object({threadId:id,kind:threadKind,canReply:z.boolean(),caseId:id.optional()});
export const threadQuery=pageQuerySchema.extend({kind:threadKind.optional(),inbox:inboxSchema.optional(),
  unread:z.enum(["true","false"]).transform((value)=>value==="true").optional(),
  includeEmpty:z.enum(["true","false"]).transform((value)=>value==="true").optional(),
  archived:z.enum(["true","false"]).transform((value)=>value==="true").optional(),q:z.string().trim().max(120).optional(),
});
export const threadSummary=z.object({
  id,kind:threadKind,contactName:z.string().nullable(),inbox:inboxSchema.nullable(),caseId:id.nullable(),
  caseStatus:caseStatus.nullable(),caseRevision:revisionSchema.nullable(),createdAt:z.iso.datetime(),
  canReply:z.boolean(),canManageCase:z.boolean(),
  activityAt:z.iso.datetime(),lastMessageAt:z.iso.datetime().nullable(),latestPreview:z.string().nullable(),latestSource:messageSource.nullable(),
  unread:z.int().nonnegative(),archived:z.boolean(),pinned:z.boolean(),muted:z.boolean(),readThroughSeq:sequenceSchema,lastSequence:sequenceSchema,
});
export const threadReferenceView=threadReference.extend({childId:id.nullable()});
export const threadDetail=threadSummary.extend({references:threadReferenceView.array()});
export const officeCaseInput=z.object({
  assigneeId:id.nullable().optional(),status:caseStatus.optional(),revision:revisionSchema,
}).refine((value)=>value.assigneeId!==undefined||value.status!==undefined,{path:["status"],message:"error.validation"});
export const officeDelegate=z.object({accountId:id,displayName:z.string()});
export const officeCase=z.object({
  id,threadId:id,inbox:inboxSchema,status:caseStatus,assigneeId:id.nullable(),assigneeName:z.string().nullable(),
  revision:revisionSchema,canManage:z.boolean(),origin:threadReference.nullable(),delegates:officeDelegate.array(),
});
export const homeworkContact=z.object({id,displayName:z.string()});
export type ThreadReference=z.infer<typeof threadReference>;
export type ThreadReferenceView=z.infer<typeof threadReferenceView>;
export type ThreadSummary=z.infer<typeof threadSummary>;
