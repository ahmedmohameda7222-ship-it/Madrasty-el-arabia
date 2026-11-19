import "server-only";
import { randomUUID } from "node:crypto";
import { errorCodes, errorMessageKeys, type ErrorCode, type ErrorEnvelope } from "@madrasty/contracts";
import type { ZodType } from "zod";

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly fields?: Record<string, string>,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

export type RequestContext = Readonly<{ requestId: string }>;

export function data<T>(value: T, status: 200 | 201 | 202 = 200, meta?: { nextCursor?: string }) {
  return Response.json({ data: value, ...(meta && { meta }) }, { status });
}

export function problem(error: ApiError, context: RequestContext) {
  const body: ErrorEnvelope = {
    error: { code: error.code, messageKey: errorMessageKeys[error.code], fields: error.fields, requestId: context.requestId },
  };
  return Response.json(body, { status: errorCodes[error.code] });
}
export function api<Extra extends unknown[]>(
  handle: (request: Request, ctx: RequestContext, ...extra: Extra) => Response | Promise<Response>,
) {
  return async (request: Request, ...extra: Extra) => {
    const requestId = randomUUID();
    let response: Response;
    try {
      response = await handle(request, { requestId }, ...extra);
    } catch (cause) {
      const error = cause instanceof ApiError ? cause : new ApiError("internal");
      if (!(cause instanceof ApiError)) {
        console.error("API request failed", { requestId, code: error.code });
      }
      response = problem(error, { requestId });
    }
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Request-Id", requestId);
    return response;
  };
}

export async function readJson<T>(request: Request, schema: ZodType<T>, maxBytes = 64 * 1024): Promise<T> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new ApiError("bad_request");
  }
  if (!request.body) throw new ApiError("bad_request");

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let total = 0;
  let body = "";
  let parsed: unknown;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new ApiError("payload_too_large");
      }
      body += decoder.decode(value, { stream: true });
    }
    parsed = JSON.parse(body + decoder.decode());
  } catch (error) {
    throw error instanceof ApiError ? error : new ApiError("bad_request");
  } finally {
    reader.releaseLock();
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const fields = Object.fromEntries(result.error.issues.map(({ path }) => [
      path.join(".") || "_", "error.validation",
    ]));
    throw new ApiError("validation", fields);
  }
  return result.data;
}
