import { z } from "zod";
import { inboxSchema } from "./capabilities";
import { localeSchema, pageQuerySchema } from "./http";

export const appearanceSchema = z.enum(["system","light","dark"]);
export const preferencesSchema = z.object({
  uiLocale: localeSchema,
  correspondenceLocale: localeSchema,
  theme: appearanceSchema,
  revision: z.number().int().nonnegative(),
});
export type Preferences = z.infer<typeof preferencesSchema>;

export const directoryRoleSchema = z.enum(["teacher","admin","principal","deputy","office","guardian"]);
export const directoryIdSchema = z.union([z.uuid(), inboxSchema]);
export const directoryQuerySchema = pageQuerySchema.extend({
  query: z.string().trim().max(120).optional(),
  view: z.enum(["mine","all"]).optional(),
  role: directoryRoleSchema.optional(),
  cursor: directoryIdSchema.optional(),
});
export const directoryTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind:z.literal("person"), id:z.uuid() }),
  z.object({ kind:z.literal("office"), id:inboxSchema }),
]);
export const directoryEntrySchema = z.object({
  id: directoryIdSchema,
  displayName: z.string().nullable(),
  titleAr: z.string(),
  titleDe: z.string(),
  role: directoryRoleSchema,
  workEmail: z.email().nullable(),
  workPhone: z.string().nullable(),
  contexts: z.object({ id:z.uuid(),nameAr:z.string(),nameDe:z.string() }).array(),
  target: directoryTargetSchema,
});
export type DirectoryEntry = z.infer<typeof directoryEntrySchema>;
export type DirectoryTarget = z.infer<typeof directoryTargetSchema>;
