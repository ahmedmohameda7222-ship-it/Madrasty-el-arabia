import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = path => readFileSync(new URL("../../apps/web/src/" + path, import.meta.url), "utf8");

test("multi-capability pages use one actor transaction, not one transaction per permission", () => {
  const paths = [
    "school/more/academics", "school/more/attendance", "school/more/curriculum",
    "school/more/timetable", "school/more/classes", "school/more/assignments",
    "school/more/finance-reports", "school/more/fee-settings", "school/more/invoices",
    "school/more/issue-invoices", "school/more/receipts", "school/more/oversight",
    "school/more/stop-reviews",
  ];
  for (const path of paths) {
    const page = source("app/[locale]/" + path + "/page.tsx");
    assert.match(page, /await mayUseMany\(session,/, path);
    assert.doesNotMatch(page, /mayUse\(session,/, path);
  }
  const tabs = source("app/[locale]/school/[tab]/page.tsx");
  assert.doesNotMatch(tabs, /mayUse\(session,|mayManageStops\(session\)/);
  assert.match(tabs, /schoolMenuAccess\(session, menuKeys\)/);
});

test("assignment list fetches substitutes in a single batch", () => {
  const service = source("server/school/assignments.ts");
  const list = service.slice(service.indexOf("export function listAssignments"), service.indexOf("function teachingOverview"));
  assert.match(list, /await delegates\(tx,\s*rows\.map\(/);
  assert.doesNotMatch(list, /await delegates\(tx,\s*row\.id\)/);
  assert.match(service, /d\.assignment_id = any\(/);
});

test("API timing covers authentication and database spans without changing private cache policy", () => {
  assert.match(source("server/http.ts"), /Server-Timing/);
  assert.match(source("server/http.ts"), /private, no-store/);
  assert.match(source("server/identity/actor.ts"), /measure\("auth"/);
  assert.match(source("server/db/scoped.ts"), /measure\("db"/);
});

test("request timing isolates concurrent requests and records failed spans", async () => {
  const { withRequestTiming, measure } = await import("../../apps/web/src/server/performance.ts");
  const a = withRequestTiming(async finish => {
    await measure("auth", async () => {});
    await assert.rejects(measure("db", async () => { throw Error("expected"); }));
    await measure("db", async () => {});
    return finish();
  });
  const b = withRequestTiming(async finish => {
    await measure("db", async () => {});
    return finish();
  });
  const [one, two] = await Promise.all([a, b]);
  assert.match(one, /app;dur=\d+(\.\d+)?/);
  assert.match(one, /auth;dur=\d+(\.\d+)?/);
  assert.match(one, /db_calls;desc="2"/);
  assert.match(two, /db_calls;desc="1"/);
  assert.doesNotMatch(two, /auth;/);
  assert.doesNotMatch(one, /expected/);
});
