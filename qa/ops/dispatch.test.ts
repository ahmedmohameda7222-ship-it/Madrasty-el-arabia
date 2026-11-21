import assert from "node:assert/strict";
import { test } from "node:test";
import { schoolFixtures } from "../fixtures/school";
import { fixtureApi } from "../support/api";

test("the dispatcher rejects ordinary app sessions and processes isolated jobs without an external provider", async () => {
  const school = schoolFixtures();
  try {
    const guardian = await school.bearer("guardian-ar", "guardian");
    await fixtureApi(school, "/internal/dispatch", { method: "POST", token: guardian, status: 401 });
    const secret = process.env.SCHOOL_WORKER_SECRET;
    assert.ok(secret);
    const { payload, trace } = await fixtureApi(school, "/internal/dispatch", { method: "POST", token: secret });
    assert.equal(payload.data.accepted, 0);
    assert.ok(payload.data.claimed <= 6);
    assert.notEqual(payload.data.projection.state, "unavailable");
    console.info("Local dispatch request", trace);
  } finally {
    await school.close();
  }
});
