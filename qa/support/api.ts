import assert from "node:assert/strict";
import { errorEnvelope } from "../../packages/contracts/src/errors";
import type { FixtureSchool, Persona } from "../fixtures/school";

type Options = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string;
  persona?: Persona;
  key?: string;
  status?: number | readonly number[];
  locale?: "ar" | "de";
};

export async function fixtureApi(school: FixtureSchool, path: string, options: Options = {}) {
  const { method = "GET", body, token, persona, key, status = 200, locale = "de" } = options;
  assert.match(path, /^\/[a-z][a-z0-9/-]*(?:\?.*)?$/);
  const headers = new Headers({ "accept-language": locale });
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (persona) headers.set("x-school-persona", persona);
  if (key) headers.set("idempotency-key", key);
  if (body !== undefined) headers.set("content-type", "application/json");
  const response = await fetch(`${school.origin}/api/v1${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "error", signal: AbortSignal.timeout(50_000),
  });
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json") ? await response.json() : null;
  const trace = response.headers.get("x-request-id");
  const errorCode = errorEnvelope.safeParse(payload).data?.error.code;
  const accepted: readonly number[] = typeof status === "number" ? [status] : status;
  assert.ok(accepted.includes(response.status), `${method} ${path} returned ${response.status} (${errorCode ?? "no error code"}), expected ${accepted.join("/")}; request ${trace}`);
  if (response.status >= 400) assert.equal(errorEnvelope.parse(payload).error.requestId, trace);
  return { payload, trace, response };
}
