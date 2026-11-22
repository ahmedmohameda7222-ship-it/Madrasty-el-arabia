import { z } from "zod";
import { localeSchema, pageQuerySchema, schoolDateSchema } from "../http";

const action = z.string().trim().min(1).max(100).regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/);
export const auditResourceKind = z.enum([
  "access","calendar","assignments","family","imports","invitation","timetable","attendance","academics","bank","finance","communications",
]);
export const auditCategory = z.enum([
  "permissions","revocation","settings","creation","update","approval","transfer","withdrawal","correction","reversal","publication",
]);
export const auditResourceLink = z.discriminatedUnion("kind",[
  z.object({kind:z.enum(["access","calendar","assignments","timetable","invitations"])}),
  z.object({kind:z.literal("student"),id:z.uuid()}),
  z.object({kind:z.literal("guardian"),id:z.uuid(),linkId:z.uuid().optional()}),
  z.object({kind:z.literal("import"),id:z.uuid()}),
  z.object({kind:z.literal("class"),id:z.uuid(),yearId:z.uuid()}),
]);
export const auditEntrySchema = z.object({
  id:z.uuid(),
  occurredAt:z.iso.datetime(),
  actorDisplay:z.string(),
  action,
  resourceKind:auditResourceKind,
  permittedResourceLink:auditResourceLink.optional(),
  changeCategory:auditCategory,
  requestId:z.uuid(),
});
const dateFields = z.object({from:schoolDateSchema.optional(),to:schoolDateSchema.optional(),locale:localeSchema.default("ar")});
const filterFields = {
  action:action.optional(), actorId:z.uuid().optional(), resourceKind:auditResourceKind.optional(),
};
function orderedDates(bounds:{from?:string;to?:string}) {
  return !bounds.from || !bounds.to || bounds.from <= bounds.to;
}
export const auditQuery = pageQuerySchema.extend(dateFields.shape).extend(filterFields)
  .extend({cursor:z.string().max(256).optional()})
  .refine(orderedDates,{path:["to"]});
export const auditFiltersQuery = dateFields.extend({
  actorQuery:z.string().trim().max(100).optional(),
}).refine(orderedDates,{path:["to"]});
export const auditFiltersSchema = z.object({
  timezone:z.string(),
  actions:z.object({action,resourceKind:auditResourceKind,changeCategory:auditCategory}).array(),
  actors:z.object({id:z.uuid(),displayName:z.string()}).array(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;
export type AuditResourceLink = z.infer<typeof auditResourceLink>;
