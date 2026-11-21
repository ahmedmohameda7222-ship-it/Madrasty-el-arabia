import {z} from "zod";
import {localeSchema,pageQuerySchema,revisionSchema,schoolDateSchema} from "../http";
import {broadcastText} from "./broadcasts";

const id=z.uuid();
export const schoolMonth=z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).refine((value)=>!value.startsWith("0000"));
export const publishingAudience=z.discriminatedUnion("kind",[
  z.object({kind:z.literal("school")}).strict(),z.object({kind:z.literal("class"),classId:id}).strict(),
]);
export const publishingState=z.enum(["draft","published","withdrawn"]);
const localized=z.object({ar:broadcastText.optional(),de:broadcastText.optional()});
const content=z.object({audience:publishingAudience,sourceLocale:localeSchema,copy:localized});
type Content=z.infer<typeof content>;
const complete=(input:Content)=>input.copy[input.sourceLocale]!==undefined;
const moment=z.object({date:schoolDateSchema,time:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable()});
export const eventTiming=z.object({start:moment,end:moment.nullable(),allDay:z.boolean()}).superRefine((value,ctx)=>{
  if(value.allDay!==!value.start.time)ctx.addIssue({code:"custom",path:["start","time"],message:"error.validation"});
  if(value.end){
    if(value.allDay!==!value.end.time)ctx.addIssue({code:"custom",path:["end","time"],message:"error.validation"});
    if(`${value.end.date}T${value.end.time??"00:00"}`<=`${value.start.date}T${value.start.time??"00:00"}`)
      ctx.addIssue({code:"custom",path:["end"],message:"error.validation"});
  }
});
const eventContent=content.extend({timing:eventTiming});
export const newsDraft=content.refine(complete,{path:["copy"]});
export const eventDraft=eventContent.refine(complete,{path:["copy"]});
const lifecycle=z.object({action:z.enum(["publish","withdraw"]),revision:revisionSchema});
const revision={action:z.literal("save"),revision:revisionSchema};
export const newsChange=z.discriminatedUnion("action",[content.extend(revision),lifecycle])
  .refine((input)=>input.action!=="save"||complete(input),{path:["copy"]});
export const eventChange=z.discriminatedUnion("action",[eventContent.extend(revision),lifecycle])
  .refine((input)=>input.action!=="save"||complete(input),{path:["copy"]});

const metadata=content.extend({
  id,classAr:z.string().nullable(),classDe:z.string().nullable(),
  state:publishingState,publishedAt:z.iso.datetime().nullable(),updatedAt:z.iso.datetime(),revision:revisionSchema,canEdit:z.boolean(),
});
export const schoolNewsEntry=metadata.extend({kind:z.literal("news")});
export const schoolEventEntry=metadata.extend({kind:z.literal("event"),timing:eventTiming,timezone:z.string().min(1)});
export const schoolPublishingEntry=z.discriminatedUnion("kind",[schoolNewsEntry,schoolEventEntry]);
export const schoolPublishingReceipt=z.object({id,revision:revisionSchema});
export const newsQuery=pageQuerySchema.extend({classId:id.optional(),view:z.enum(["feed","managed"]).default("feed")});
export const eventsQuery=newsQuery.extend({month:schoolMonth});
export const publishingOptions=z.object({
  schoolDate:schoolDateSchema,timezone:z.string().min(1),schoolWide:z.boolean(),
  classes:z.object({id,code:z.string(),nameAr:z.string(),nameDe:z.string(),canWrite:z.boolean()}).array(),
});
export type PublishingContent=z.infer<typeof newsDraft>|z.infer<typeof eventDraft>;
export type PublishingEntry=z.infer<typeof schoolPublishingEntry>;
export type PublishingOptions=z.infer<typeof publishingOptions>;
