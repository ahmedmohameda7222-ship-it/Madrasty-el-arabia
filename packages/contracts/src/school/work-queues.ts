import { z } from "zod";
import { pageQuerySchema, schoolDateSchema } from "../http";

export const schoolQueueKeySchema = z.enum(["guardian_links","family_imports","class_assignments"]);
export const dashboardModuleKeySchema = z.enum([
  "bounced_invites","unapproved_attendance","noncontinuation_requests","settlement_review",
]);
export const workQueueKeySchema = z.union([schoolQueueKeySchema,dashboardModuleKeySchema]);
export type WorkQueueKey = z.infer<typeof workQueueKeySchema>;
export type SchoolQueueKey = z.infer<typeof schoolQueueKeySchema>;

const target = z.discriminatedUnion("kind",[
  z.object({kind:z.literal("bounced_invite"),invitationId:z.uuid()}),
  z.object({kind:z.literal("attendance_sheet"),classId:z.uuid(),date:schoolDateSchema}),
  z.object({kind:z.literal("enrollment_stop"),requestId:z.uuid()}),
  z.object({kind:z.literal("receipt_match"),receiptId:z.uuid()}),
  z.object({kind:z.literal("guardian_link"),guardianId:z.uuid(),linkId:z.uuid()}),
  z.object({kind:z.literal("family_import"),jobId:z.uuid()}),
  z.object({kind:z.literal("class_assignment"),classId:z.uuid(),yearId:z.uuid()}),
]);
export const queueItemSchema = z.object({
  id:z.uuid(),titleAr:z.string(),titleDe:z.string(),detailAr:z.string(),detailDe:z.string(),target,
});
export type QueueItem = z.infer<typeof queueItemSchema>;
export const queueFilterSchema = z.object({asOf:schoolDateSchema.optional()});
export const queueListQuery = pageQuerySchema.extend({asOf:schoolDateSchema.optional(),cursor:z.uuid().optional()});
const queueTarget = z.object({
  key:workQueueKeySchema,
  route:z.templateLiteral(["/school/home/queues/",workQueueKeySchema]),
  filters:z.object({asOf:schoolDateSchema}),
});
export const queueSummarySchema = z.discriminatedUnion("state",[
  queueTarget.extend({state:z.literal("ready"),count:z.int().nonnegative()}),
  queueTarget.extend({state:z.literal("unavailable")}),
]);
export const workQueuesSchema = z.union([
  z.object({
    asOf: schoolDateSchema,
    today: schoolDateSchema,
    timezone: z.string(),
    setupRequired: z.literal(false).optional(),
    overview: z.object({
      students: z.int().nonnegative().nullable(),
      classes: z.int().nonnegative().nullable(),
      teachers: z.int().nonnegative().nullable(),
      mayPublish: z.boolean(),
      mayIssue: z.boolean(),
      schoolDays: z.object({last:schoolDateSchema.nullable(),next:schoolDateSchema.nullable()}).optional(),
      maySchedule:z.boolean().optional(),
      mayMonitor:z.boolean().optional(),
      attendance:z.object({date:schoolDateSchema,expectedClasses:z.int().nonnegative(),approvedClasses:z.int().nonnegative(),present:z.int().nonnegative(),late:z.int().nonnegative(),absent:z.int().nonnegative()}).nullable().optional(),
      finance:z.object({month:z.string().regex(/^\d{4}-\d{2}$/),currency:z.string().length(3),cash:z.int().nonnegative(),bank:z.int().nonnegative()}).optional(),
    }).optional(),
    queues: queueSummarySchema.array(),
  }),
  z.object({
    asOf: z.null(),
    today: z.null(),
    timezone: z.null(),
    setupRequired: z.literal(true),
    mayConfigure: z.boolean(),
    queues: z.tuple([]),
  }),
]);
export const queuePageSchema = z.object({asOf:schoolDateSchema,items:queueItemSchema.array()});
