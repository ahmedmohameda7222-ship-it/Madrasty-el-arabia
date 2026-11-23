import "server-only";
import { directStaffAccountSchema, type directStaffAccountInput } from "@madrasty/contracts";
import { type z } from "zod";
import { ApiError } from "@/server/http";
import { withActor, type ActorContext } from "@/server/db/scoped";
import { appendAudit } from "@/server/db/outbox";
import { authProvider } from "./provider";

/** Verify authorization BEFORE any external Auth operation; repeat inside DB transaction. */
export async function provisionStaffAccount(ctx: ActorContext, input: z.infer<typeof directStaffAccountInput>) {
  const [preflight] = await withActor(ctx, tx => tx<{ allowed: boolean }[]>`
    select app.can_provision_staff_account(${input.role}) as allowed
  `);
  if (!preflight?.allowed) throw new ApiError("forbidden");

  const provider = authProvider(true);
  const { data, error } = await provider.admin.createUser({
    email: input.email, password: input.password, email_confirm: true,
  });
  if (error) throw new ApiError(error.status === 429 ? "throttled" : (error.status ?? 0) >= 500 ? "unavailable" : "conflict");
  const providerId = data.user?.id;
  if (!providerId) throw new ApiError("unavailable");

  try {
    const [record] = await withActor(ctx, async tx => {
      const rows = await tx<{ account_id: string; staff_id: string }[]>`
        select * from app.provision_staff_account(
          ${providerId}::uuid,${input.displayName},${input.email},${input.workPhone ?? null},
          ${input.role},${input.correspondenceLocale},${tx.array(input.capabilities)}::text[]
        )
      `;
      if (!rows[0]) throw new ApiError("unavailable");
      await appendAudit(tx, { action:"school.staff_created", aggregateId:rows[0].staff_id });
      return rows;
    });
    return directStaffAccountSchema.parse({
      accountId: record.account_id, staffId: record.staff_id, role: input.role,
    });
  } catch (cause) {
    // Auth Admin and PostgreSQL are separate transactional systems. Roll back
    // only the provider identity created by this request when DB save fails.
    await provider.admin.deleteUser(providerId).catch(() => undefined);
    throw cause;
  }
}
