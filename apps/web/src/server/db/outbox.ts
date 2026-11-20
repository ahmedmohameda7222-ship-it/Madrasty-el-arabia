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

export async function appendEvents(tx:Transaction,inputs:Omit<SchoolEvent,"id"|"occurredAt">[]){
  if(!inputs.length)return;
  const occurredAt=new Date().toISOString();
  const events=inputs.map((input)=>eventSchema.parse({...input,id:randomUUID(),occurredAt}));
  await tx`
    insert into app.outbox_event(id,type,occurred_at,actor_id,aggregate_id,payload)
    select id,type,"occurredAt","actorId","aggregateId",payload
    from jsonb_to_recordset(${tx.json(events)}) as e(id uuid,type text,"occurredAt" timestamptz,"actorId" uuid,"aggregateId" uuid,payload jsonb)
  `;
}

export async function appendAudits(tx:Transaction,entries:AuditChange[]){
  if(!entries.length)return;
  await tx`
    insert into app.audit_entry(actor_id,persona,request_id,action,aggregate_id,metadata)
    select app.actor_account(),app.actor_persona(),app.actor_request(),action,"aggregateId",coalesce(metadata,'{}'::jsonb)
    from jsonb_to_recordset(${tx.json(entries)}) as e(action text,"aggregateId" uuid,metadata jsonb)
  `;
}

export type AuditChange={action:string;aggregateId:string;metadata?:Record<string,JSONValue>};

export async function appendAudit(
  tx: Transaction,
  entry: AuditChange,
) {
  await tx`
    insert into app.audit_entry (actor_id, persona, request_id, action, aggregate_id, metadata)
    values (app.actor_account(), app.actor_persona(), app.actor_request(),
            ${entry.action}, ${entry.aggregateId}, ${tx.json(entry.metadata ?? {})})
  `;
}
