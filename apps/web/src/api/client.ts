import { errorEnvelope, successEnvelope } from "@madrasty/contracts";
import type { ZodType } from "zod";
import { createReadFlights } from "./read-flight";

const readFlights = createReadFlights();

export class ApiResponseError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly messageKey: string,
    readonly fields?: Record<string, string>,
    readonly requestId?: string,
  ) {
    super(code);
    this.name = "ApiResponseError";
  }
}

export async function requestApi<T>(path: `/${string}`, schema: ZodType<T>, options?: RequestInit) {
  const write = !["GET","HEAD"].includes((options?.method ?? "GET").toUpperCase());
  if (write) readFlights.invalidate();
  try {
    const response = await fetch(`/api/v1${path}`, {
      ...options,
      cache: "no-store",
      credentials: "same-origin",
    });
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const decoded = errorEnvelope.safeParse(body);
      if (!decoded.success) {
        throw new ApiResponseError(response.status, "unavailable", "error.unavailable");
      }
      const { code, messageKey, fields, requestId } = decoded.data.error;
      throw new ApiResponseError(response.status, code, messageKey, fields, requestId);
    }
    return successEnvelope(schema).parse(body);
  } finally {
    if (write) readFlights.invalidate();
  }
}

/** Share only concurrent initial reads of exactly the same schema and account/session/persona/path.
 * No completed result is cached; refreshes and writes keep their existing semantics. */
export function requestInitialRead<T>(scope:string,path:`/${string}`,schema:ZodType<T>,persona:string,signal:AbortSignal) {
  return readFlights.read(schema,JSON.stringify([scope,path,persona]),signal,sharedSignal=>
    requestApi(path,schema,{signal:sharedSignal,headers:{"X-School-Persona":persona}}));
}
