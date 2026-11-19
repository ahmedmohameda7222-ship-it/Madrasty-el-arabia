import { errorEnvelope, successEnvelope } from "@madrasty/contracts";
import type { ZodType } from "zod";

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
}
