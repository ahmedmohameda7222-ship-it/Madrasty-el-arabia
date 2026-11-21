import assert from "node:assert/strict";
import { test } from "node:test";
import { schoolFixtures, principals } from "../fixtures/school";
import { fixtureApi } from "../support/api";

test("two independent fixture runs coexist and cleanup removes only the unused run", async () => {
  const school = schoolFixtures();
  try {
    const first = await school.seed();
    const second = await school.seed(school.collisionRun);
    assert.equal(Object.keys(first).length, principals.length + 4);
    assert.equal(Object.keys(second).length, principals.length + 4);
    assert.ok(Object.values(first).every((id) => !Object.values(second).includes(id)));
    assert.equal(await school.purgeUnused(school.collisionRun), principals.length);
    assert.deepEqual(await school.references(school.collisionRun), {});
    assert.deepEqual(await school.references(), first);
    console.info("Seeded isolated runs", school.run, school.collisionRun);
  } finally {
    await school.close();
  }
});

test("local v1 pagination and concealed objects keep adult accounts scoped to their own children", async () => {
  const school = schoolFixtures();
  try {
    const ids = await school.seed();
    const guardian = await school.bearer("guardian-ar", "guardian");
    const { payload: first } = await fixtureApi(school, "/me/children?limit=1", { token: guardian });
    assert.equal(first.data.length, 1);
    assert.equal(typeof first.meta.nextCursor, "string");
    const { payload: second } = await fixtureApi(school, `/me/children?limit=1&cursor=${encodeURIComponent(first.meta.nextCursor)}`, { token: guardian });
    assert.equal(second.data.length, 1);
    assert.deepEqual(new Set([first.data[0].childId ?? first.data[0].id, second.data[0].childId ?? second.data[0].id]),
      new Set([ids.ahmed, ids.omar]));
    assert.equal(second.meta?.nextCursor, undefined);
    const { payload: localized } = await fixtureApi(school, "/me/children?limit=101", {
      token: guardian, status: 422, locale: "ar",
    });
    assert.equal(localized.error.messageKey, "error.validation");
    const missing = await fixtureApi(school, "/me/children/71717171-7171-4171-8171-717171717171", { token: guardian, status: 404 });
    for (const id of [ids.other, ids.revoked]) {
      const hidden = await fixtureApi(school, `/me/children/${id}`, { token: guardian, status: 404 });
      assert.equal(hidden.payload.error.code, missing.payload.error.code);
      assert.deepEqual(hidden.payload.error.fields, missing.payload.error.fields);
    }
  } finally {
    await school.close();
  }
});

test("the API stops serving private results after expiration of the provider session", async () => {
  const school = schoolFixtures();
  try {
    const token = await school.bearer("guardian-de", "guardian");
    await fixtureApi(school, "/me/children", { token });
    await school.expireSession(token);
    const expired = await fixtureApi(school, "/me/children", { token, status: 401 });
    assert.equal(expired.payload.error.code, "unauthenticated");
  } finally {
    await school.close();
  }
});
