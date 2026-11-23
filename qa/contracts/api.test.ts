import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parse } from "yaml";
import { androidClientVersions } from "../../packages/contracts/src/clientVersions";
import { errorEnvelope } from "../../packages/contracts/src/errors";
import { healthSchema, pageQuerySchema, successEnvelope } from "../../packages/contracts/src/http";
import { schoolResourceLinkSchema } from "../../packages/contracts/src/resourceLinks";
import { candidate, fixtureEmail, localAuth, localOrigin, localProject, newRunId, publicRead, requireFixtureTarget } from "../support/target";

import { workQueuesSchema } from "../../packages/contracts/src/school/work-queues";

const source = readFileSync(new URL("../../packages/contracts/openapi.yaml", import.meta.url));
const contract = parse(source.toString("utf8"));

test("the local contract declares the expected API operations with unique identifiers", () => {
  const ids = Object.values(contract.paths).flatMap((entries) => Object.values(entries as Record<string, { operationId?: string }>))
    .flatMap((operation) => operation.operationId ? [operation.operationId] : []);
  assert.equal(ids.length, 254);
  assert.equal(new Set(ids).size, ids.length);
});

test("the health example decodes through the web client schema", () => {
  const example = contract.paths["/health"].get.responses["200"].content["application/json"].example;
  assert.deepEqual(successEnvelope(healthSchema).parse(example), { data: { status: "ok", apiVersion: "v1" } });
});

test("pagination defaults to 25 and rejects oversize or incomplete pages", () => {
  assert.deepEqual(pageQuerySchema.parse({}), { limit: 25 });
  assert.deepEqual(pageQuerySchema.parse({ limit: "100", cursor: "next-page" }), { limit: 100, cursor: "next-page" });
  for (const input of [{ limit: 0 }, { limit: 101 }, { limit: 1.5 }, { cursor: "" }]) {
    assert.equal(pageQuerySchema.safeParse(input).success, false);
  }
});

test("a contextual attendance link keeps the selected child and school date", () => {
  const id = "30303030-3030-4030-8030-303030303030";
  const childId = "40404040-4040-4040-8040-404040404040";
  const link = { kind: "attendance", id, childId, date: "2026-11-21" };
  assert.deepEqual(schoolResourceLinkSchema.parse(JSON.parse(JSON.stringify(link))), link);
  assert.equal(schoolResourceLinkSchema.safeParse({ ...link, date: "2026-02-30" }).success, false);
});

test("the fixture guard rejects the live application, remote database and owner login", () => {
  const approved = {
    QA_PROJECT: localProject, QA_ORIGIN: localOrigin, QA_AUTH: localAuth,
    QA_FIXTURE_DATABASE_URL: "postgresql://madrasty_qa_fixture:example@127.0.0.1:55422/postgres",
  };
  assert.equal(requireFixtureTarget(approved).origin, localOrigin);
  assert.throws(() => requireFixtureTarget({ ...approved, QA_ORIGIN: "https://madrastyelarabia.vercel.app" }));
  assert.throws(() => requireFixtureTarget({ ...approved, QA_PROJECT: candidate.projectRef }));
  assert.throws(() => requireFixtureTarget({ ...approved, QA_AUTH: `https://${candidate.projectRef}.supabase.co` }));
  assert.throws(() => requireFixtureTarget({ ...approved, QA_FIXTURE_DATABASE_URL: approved.QA_FIXTURE_DATABASE_URL.replace("127.0.0.1", "example.com") }));
  assert.throws(() => requireFixtureTarget({ ...approved, QA_FIXTURE_DATABASE_URL: approved.QA_FIXTURE_DATABASE_URL.replace("madrasty_qa_fixture", "postgres") }));
});

test("independent run IDs namespace synthetic guardian mailboxes", () => {
  const firstRun = newRunId();
  const secondRun = newRunId();
  assert.notEqual(fixtureEmail(firstRun, "guardian-ar"), fixtureEmail(secondRun, "guardian-ar"));
  assert.match(fixtureEmail(firstRun, "guardian-ar"), /^qa-[a-f0-9]{32}\.guardian-ar@madrasty\.invalid$/);
  assert.throws(() => fixtureEmail(firstRun, "recipient@example.com"));
  assert.throws(() => fixtureEmail("school", "guardian-ar"));
  console.info("Fixture namespaces", firstRun, secondRun, "candidate", candidate.webSha);
});

test("live API serves the versioned health response with a traceable request ID", async () => {
  const response = await publicRead("/api/v1/health");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("x-request-id") ?? "", /^[0-9a-f-]{36}$/i);
  assert.deepEqual(successEnvelope(healthSchema).parse(await response.json()), {
    data: { status: "ok", apiVersion: "v1" },
  });
});

test("the public APK version API supplies the recorded build and checksum", async () => {
  const response = await publicRead("/api/v1/client-versions");
  assert.equal(response.status, 200);
  const { data } = successEnvelope(androidClientVersions).parse(await response.json());
  assert.equal(data.suggestedVersionCode, 2);
  assert.equal(data.suggestedVersionName, "0.1.1");
  assert.equal(data.sha256, candidate.apkSha256);
});

test("Android Auth discovery points to the school Supabase project using a publishable key", async () => {
  const response = await publicRead("/api/v1/auth/config");
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.equal(data.origin, `https://${candidate.projectRef}.supabase.co`);
  assert.ok(typeof data.publishableKey === "string" && data.publishableKey.startsWith("sb_publishable_"));
});

test("an absent session produces the documented unauthorized envelope", async () => {
  const response = await publicRead("/api/v1/auth/session");
  assert.equal(response.status, 401);
  const { error } = errorEnvelope.parse(await response.json());
  assert.equal(error.code, "unauthenticated");
  assert.equal(error.messageKey, "error.unauthenticated");
  assert.equal(error.requestId, response.headers.get("x-request-id"));
});

test("dashboard wire contract separates first-run setup and configured data", () => {
  const setup = { asOf: null, today: null, timezone: null, setupRequired: true, mayConfigure: false, queues: [] };
  const configured = { asOf: "2026-11-21", today: "2026-11-21", timezone: "Europe/Berlin", queues: [] };
  assert.deepEqual(workQueuesSchema.parse(setup), setup);
  assert.deepEqual(workQueuesSchema.parse(configured), configured);
  assert.equal(workQueuesSchema.safeParse({ ...setup, setupRequired: false }).success, false);
  assert.equal(workQueuesSchema.safeParse({ ...setup, today: configured.today }).success, false);
});
