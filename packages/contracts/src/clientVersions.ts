import {z} from "zod";
import type {AndroidClientVersions} from "./generated";

const version=z.int().min(1).max(2100000000);
export const androidClientVersions=z.object({
  minimumVersionCode:version,suggestedVersionCode:version,suggestedVersionName:z.string().min(1).max(40),
  downloadUrl:z.url().refine((value)=>new URL(value).protocol==="https:"),sha256:z.string().regex(/^[a-f0-9]{64}$/),
}).refine((value)=>value.minimumVersionCode<=value.suggestedVersionCode,{path:["minimumVersionCode"]}) satisfies z.ZodType<AndroidClientVersions>;
