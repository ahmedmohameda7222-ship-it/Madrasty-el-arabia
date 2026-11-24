import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { workQueueKeySchema } from "../../packages/contracts/src/school/work-queues";

test("retired audit and delivery-status routes are absent", () => {
  for (const path of [
    "apps/web/src/app/[locale]/school/more/audit/page.tsx",
    "apps/web/src/app/[locale]/school/more/delivery-status/page.tsx",
    "apps/web/src/app/api/v1/school/audit/route.ts",
    "apps/web/src/app/api/v1/school/audit/filters/route.ts",
    "apps/web/src/app/api/v1/school/audit/[id]/route.ts",
    "apps/web/src/app/api/v1/delivery-status/route.ts",
    "apps/web/src/app/api/v1/delivery-status/access/route.ts",
    "apps/web/src/app/api/v1/delivery-status/[id]/redrive/route.ts",
  ]) assert.equal(existsSync(path), false, path);
});

test("failed-delivery review is not an available dashboard queue", () => {
  assert.equal(workQueueKeySchema.safeParse("failed_deliveries").success, false);
  assert.equal(workQueueKeySchema.safeParse("settlement_review").success, true);
});

test("ordinary notification transport and security audit writes are retained", () => {
  assert.ok(existsSync("apps/web/src/server/db/outbox.ts"));
  assert.match(readFileSync("apps/web/src/server/db/outbox.ts", "utf8"), /appendAudit/);
  assert.ok(existsSync("apps/web/src/server/comms/notifications.ts"));
});
