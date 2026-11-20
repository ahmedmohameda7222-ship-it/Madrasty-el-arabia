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
const databaseKeys = {
  app_runtime:"DATABASE_URL",app_delivery_worker:"DELIVERY_WORKER_DATABASE_URL",app_invite_worker:"INVITE_WORKER_DATABASE_URL",
} as const;
type DatabaseRole=keyof typeof databaseKeys;
const connections=new Map<DatabaseRole,ReturnType<typeof postgres>>();

function database(role:DatabaseRole) {
  const existing=connections.get(role);
  if(existing)return existing;
  const url=process.env[databaseKeys[role]];
  if(!url)throw new ApiError("unavailable");
  const connection=postgres(url,{
    prepare:false,
    ssl:process.env.NODE_ENV==="production"?"verify-full":undefined,
    max:role==="app_runtime"?4:2,
    idle_timeout:20,
    connect_timeout:8,
  });
  connections.set(role,connection);
  return connection;
}

async function withRole<T>(role:DatabaseRole,work:(tx:Transaction)=>Promise<T>):Promise<T> {
  try {
    return await database(role).begin(async (tx) => {
      const [login] = await tx<{ restricted: boolean }[]>`
        select not (rolsuper or rolbypassrls) as restricted from pg_roles where rolname = session_user
      `;
      if (!login?.restricted) throw new ApiError("unavailable");
      await tx`set local role ${tx(role)}`;
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

export const withRuntime=<T>(work:(tx:Transaction)=>Promise<T>)=>withRole("app_runtime",work);
export const withDeliveryWorker=<T>(work:(tx:Transaction)=>Promise<T>)=>withRole("app_delivery_worker",work);
export const withInviteWorker=<T>(work:(tx:Transaction)=>Promise<T>)=>withRole("app_invite_worker",work);

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
    if (ctx.persona === "admin") {
      if (ctx.assurance !== "aal2") throw new ApiError("forbidden");
      const [factor] = await tx<{ verified: boolean }[]>`select app.has_verified_factor(${ctx.accountId}) as verified`;
      if (!factor.verified) throw new ApiError("forbidden");
    }
    return work(tx);
  });
}
