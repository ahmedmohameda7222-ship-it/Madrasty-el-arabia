import "server-only";
import postgres, { type TransactionSql } from "postgres";
import type { Persona } from "@madrasty/contracts";
import { ApiError, type RequestContext } from "@/server/http";

export type ActorContext = Readonly<RequestContext & {
  accountId: string;
  sessionId: string;
  persona: Persona;
  assurance: "aal1" | "aal2";
}>;

export type Transaction = TransactionSql;
let connection: ReturnType<typeof postgres> | undefined;

function database() {
  if (connection) return connection;
  const url = process.env.DATABASE_URL;
  if (!url) throw new ApiError("unavailable");
  connection = postgres(url, {
    prepare: false,
    ssl: process.env.NODE_ENV === "production" ? "verify-full" : undefined,
    max: 4,
    idle_timeout: 20,
    connect_timeout: 8,
  });
  return connection;
}

export async function withRuntime<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
  try {
    return await database().begin(async (tx) => {
      const [login] = await tx<{ restricted: boolean }[]>`
        select not (rolsuper or rolbypassrls) as restricted from pg_roles where rolname = session_user
      `;
      if (!login?.restricted) throw new ApiError("unavailable");
      await tx`set local role app_runtime`;
      await tx`set local statement_timeout = '8000ms'`;
      return work(tx);
    }) as T;
  } catch (error) {
    if (error instanceof postgres.PostgresError) {
      if (["23505", "23P01", "40001", "40P01"].includes(error.code)) throw new ApiError("conflict");
      if (["23503", "23514"].includes(error.code)) throw new ApiError("validation");
      if (error.code === "42501") throw new ApiError("forbidden");
      if (error.code === "57014" || error.code.startsWith("08")) throw new ApiError("unavailable");
    }
    if (error && typeof error === "object" && "code" in error &&
      ["CONNECT_TIMEOUT", "CONNECTION_CLOSED", "ECONNREFUSED", "ETIMEDOUT"].includes(String(error.code))) {
      throw new ApiError("unavailable");
    }
    throw error;
  }
}

export function withActor<T>(ctx: ActorContext, work: (tx: Transaction) => Promise<T>): Promise<T> {
  return withRuntime(async (tx) => {
    await tx`
      select set_config('app.account_id', ${ctx.accountId}, true),
             set_config('app.session_id', ${ctx.sessionId}, true),
             set_config('app.persona', ${ctx.persona}, true),
             set_config('app.request_id', ${ctx.requestId}, true),
             set_config('app.assurance', ${ctx.assurance}, true)
    `;
    const [guard] = await tx<{ allowed: boolean }[]>`select app.guard_actor() as allowed`;
    if (!guard.allowed) throw new ApiError("forbidden");
    return work(tx);
  });
}
