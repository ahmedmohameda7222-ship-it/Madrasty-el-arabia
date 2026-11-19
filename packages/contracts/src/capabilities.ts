import { z } from "zod";
import { personaSchema, revisionSchema } from "./http";

export const capabilityKeys = ["access.manage","school.manage","students.manage","applications.manage","attendance.supervise","academics.supervise","comms.publish","finance.read","finance.issue","finance.post","finance.export","bank.configure","audit.read"] as const;
export const capabilitySchema = z.enum(capabilityKeys);
export type Capability = z.infer<typeof capabilitySchema>;
export const inboxSchema = z.enum(["student_affairs", "accounts"]);
export type Inbox = z.infer<typeof inboxSchema>;

const interval = z.object({ validFrom: z.iso.datetime(), validUntil: z.iso.datetime().nullable() });
export const capabilityGrantSchema = interval.extend({ key: capabilitySchema });
export const inboxGrantSchema = interval.extend({ key: inboxSchema });
export type CapabilityGrant = z.infer<typeof capabilityGrantSchema>;
export type InboxGrant = z.infer<typeof inboxGrantSchema>;
export const accessEditSchema = z.object({
  revision: revisionSchema,
  personas: z.array(personaSchema).max(3),
  capabilities: z.array(capabilityGrantSchema).max(capabilityKeys.length),
  inboxAssignments: z.array(inboxGrantSchema).max(inboxSchema.options.length),
}).superRefine((edit, context) => {
  const noDuplicates = (keys: string[]) => new Set(keys).size === keys.length;
  if (!noDuplicates(edit.personas)) context.addIssue({ code: "custom", message: "duplicate", path: ["personas"] });
  for (const field of ["capabilities", "inboxAssignments"] as const) {
    if (!noDuplicates(edit[field].map(({ key }) => key))) {
      context.addIssue({ code: "custom", message: "duplicate", path: [field] });
    }
    edit[field].forEach((grant, index) => {
      if (grant.validUntil && Date.parse(grant.validUntil) <= Date.parse(grant.validFrom)) {
        context.addIssue({ code: "custom", message: "interval", path: [field, index, "validUntil"] });
      }
    });
  }
  if (!edit.personas.includes("admin") && (edit.capabilities.length || edit.inboxAssignments.length)) {
    context.addIssue({ code: "custom", message: "admin persona required", path: ["personas"] });
  }
});
export const accessSummarySchema = z.object({
  accountId: z.uuid(), email: z.email().nullable(), verifiedMfa: z.boolean(),
  revision: revisionSchema, personas: z.array(personaSchema),
  capabilities: z.array(capabilityGrantSchema), inboxAssignments: z.array(inboxGrantSchema),
});
export const accessTargetsSchema = z.array(z.object({ accountId: z.uuid(), email: z.email().nullable() }));
export type AccessEdit = z.infer<typeof accessEditSchema>;
export type AccessSummary = z.infer<typeof accessSummarySchema>;
