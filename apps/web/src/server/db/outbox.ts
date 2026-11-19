import "server-only";
import { randomUUID } from "node:crypto";
import { eventSchema, type SchoolEvent } from "@madrasty/contracts";
import type { JSONValue } from "postgres";
import type { Transaction } from "./scoped";

export async function appendEvent(tx: Transaction, input: Omit<SchoolEvent, "id" | "occurredAt">) {
  const event = eventSchema.parse({ ...input, id: randomUUID(), occurredAt: new Date().toISOString() });
  await tx`
    insert into app.outbox_event (id, type, occurred_at, actor_id, aggregate_id, payload)
    values (${event.id}, ${event.type}, ${event.occurredAt}, ${event.actorId},
            ${event.aggregateId}, ${tx.json(event.payload)})
  `;
  return event.id;
}

export async function appendAudit(
  tx: Transaction,
  entry: { action: string; aggregateId: string; metadata?: Record<string, JSONValue> },
) {
  await tx`
    insert into app.audit_entry (actor_id, persona, request_id, action, aggregate_id, metadata)
    values (app.actor_account(), app.actor_persona(), app.actor_request(),
            ${entry.action}, ${entry.aggregateId}, ${tx.json(entry.metadata ?? {})})
  `;
}
