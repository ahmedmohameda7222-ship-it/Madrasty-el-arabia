import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { ApiError } from "@/server/http";
import { withRuntime } from "@/server/db/scoped";
import type { SchoolSession } from "@madrasty/contracts";

const digest = (ticket: string) => createHash("sha256").update(ticket).digest("hex");
export const revocationTicketSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const revokeWithTicketInput = z.object({ ticket: revocationTicketSchema, allDevices: z.boolean() });

export async function makeRevocationTicket(session: SchoolSession) {
  const ticket = randomBytes(32).toString("hex");
  const [result] = await withRuntime((tx) => tx<{ issued: boolean }[]>`
    select app.issue_logout_ticket(${session.accountId}, ${session.sessionId}, ${digest(ticket)}) as issued
  `);
  if (!result.issued) throw new ApiError("forbidden");
  return ticket;
}

export async function revokeWithTicket(ticket: string, allDevices: boolean) {
  if (!revocationTicketSchema.safeParse(ticket).success) throw new ApiError("unauthenticated");
  const [result] = await withRuntime((tx) => tx<{ revoked: boolean }[]>`
    select app.revoke_with_ticket(${digest(ticket)}, ${allDevices}) as revoked
  `);
  if (!result.revoked) throw new ApiError("unauthenticated");
}
