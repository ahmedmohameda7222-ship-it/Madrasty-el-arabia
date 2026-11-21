import {z} from "zod";
import {schoolResourceKindValues,type SchoolResourceLink} from "./generated";
import {schoolDateSchema} from "./http";

const childKinds=["attendance","exam","evaluation","activity","homework"] as const;
export const schoolResourceLinkSchema=z.object({
  kind:z.enum(schoolResourceKindValues),id:z.uuid(),childId:z.uuid().optional(),date:schoolDateSchema.optional(),
}).strict().superRefine((value,ctx)=>{
  const childRequired=childKinds.some((kind)=>kind===value.kind);
  if(Boolean(value.childId)!==childRequired)ctx.addIssue({code:"custom",path:["childId"],message:"resource relationship"});
  if(Boolean(value.date)!==(value.kind==="attendance"))ctx.addIssue({code:"custom",path:["date"],message:"attendance date"});
}) satisfies z.ZodType<SchoolResourceLink>;
