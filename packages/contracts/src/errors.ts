import { z } from "zod";

export const errorCodes = {
  bad_request: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  stale_revision: 409,
  closed_day: 409,
  attendance_incomplete: 422,
  invalid_idempotency_key: 400,
  idempotency_conflict: 409,
  payload_too_large: 413,
  validation: 422,
  throttled: 429,
  unavailable: 503,
  internal: 500,
} as const;

export type ErrorCode = keyof typeof errorCodes;

export const errorMessageKeys = {
  bad_request: "error.badRequest",
  unauthenticated: "error.unauthenticated",
  forbidden: "error.forbidden",
  not_found: "error.notFound",
  conflict: "error.conflict",
  stale_revision: "error.staleRevision",
  closed_day: "attendance.closedDay",
  attendance_incomplete: "attendance.incomplete",
  invalid_idempotency_key: "error.invalidIdempotencyKey",
  idempotency_conflict: "error.idempotencyConflict",
  payload_too_large: "error.payloadTooLarge",
  validation: "error.validation",
  throttled: "error.throttled",
  unavailable: "error.unavailable",
  internal: "error.internal",
} as const satisfies Record<ErrorCode, string>;

export const errorEnvelope = z.object({
  error: z.object({
    // v1 clients keep unknown keys so they can fall back to a localized generic error.
    code: z.string().min(1),
    messageKey: z.string().min(1),
    fields: z.record(z.string(), z.string()).optional(),
    requestId: z.uuid(),
  }),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelope>;
