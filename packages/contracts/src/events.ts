import { z } from "zod";

export const eventSchema = z.object({
  id: z.uuid(),
  type: z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/),
  occurredAt: z.iso.datetime(),
  actorId: z.uuid(),
  aggregateId: z.uuid(),
  payload: z.record(z.string(), z.json()),
});

export type SchoolEvent = z.infer<typeof eventSchema>;
