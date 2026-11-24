import assert from "node:assert/strict";
import { test } from "node:test";
import { enrollmentSchema, rolloverPreviewSchema } from "../../packages/contracts/src/school/enrollments";
import { setUpCalendar } from "../fixtures/calendar";
import { schoolFixtures } from "../fixtures/school";
import { fixtureApi } from "../support/api";

test("a dated transfer preserves the old class", async () => {
  const school = schoolFixtures();
  try {
    const admin = await school.bearer("admin", "admin");
    const { apple, berry, ids } = await setUpCalendar(school, admin);
    const historyPath = `/school/students/${ids.other}/enrollments`;
    const read = async () => enrollmentSchema.array().parse((await fixtureApi(school, historyPath, { token: admin })).payload.data);
    const original = (await read()).find((item) => item.classId === berry.id);
    assert.ok(original);
    const effectiveDate = "2026-11-30";
    const reason = "Private synthetic transfer note";
    const action = { token: admin, persona: "admin", method: "POST", key: `${school.run}.transfer-other`,
      body: { effectiveDate, toClassId: apple.id, reason, revision: original.revision } } as const;
    await fixtureApi(school, `/school/enrollments/${original.id}/transfer`, action);
    const history = await read();
    assert.equal(history.find((item) => item.classId === berry.id)?.effectiveUntil, effectiveDate);
    assert.equal(history.find((item) => item.classId === apple.id)?.effectiveFrom, effectiveDate);
    assert.equal(JSON.stringify(history).includes(reason), false);
  } finally {
    await school.close();
  }
});

test("a reviewed rollover preserves history and replay does not create a second destination enrollment", async () => {
  const school = schoolFixtures();
  try {
    const admin = await school.bearer("admin", "admin");
    const { ids, command } = await setUpCalendar(school, admin);
    const weekdays = [1, 2, 3, 4, 5];
    const source = await command("/school/years", "rollover-source", {
      startsOn: "2027-01-01", endsExclusive: "2027-07-01", teachingWeekdays: weekdays, state: "active",
    });
    const target = await command("/school/years", "rollover-target", {
      startsOn: "2027-07-01", endsExclusive: "2028-01-01", teachingWeekdays: weekdays, state: "draft",
    });
    const createClass = (yearId: string, code: string) => command("/school/classes", code, {
      yearId, code, nameAr: "فصل الترحيل", nameDe: "QA-Versetzung", capacity: 5,
    });
    const before = await createClass(source.id, "QA_ROLL_BEFORE");
    const after = await createClass(target.id, "QA_ROLL_AFTER");
    await command(`/school/classes/${before.id}/enrollments`, "rollover-enroll", {
      studentIds: [ids.other], from: source.startsOn, revision: before.revision,
    });
    const draft = rolloverPreviewSchema.parse(await command(`/school/years/${source.id}/rollovers/preview`, "rollover-preview", {
      targetYearId: target.id, classMap: [{ fromClassId: before.id, toClassId: after.id }], exceptions: [],
    }));
    assert.deepEqual(draft.counts, { changes: 1, conflicts: 0, noPlacement: 0 });
    const path = `/school/rollovers/${draft.id}/confirm`;
    const first = rolloverPreviewSchema.parse(await command(path, "rollover-confirm", { revision: draft.revision }));
    assert.equal(first.confirmed, true);
    assert.deepEqual(await command(path, "rollover-confirm", { revision: draft.revision }), first);
    const { payload } = await fixtureApi(school, `/school/students/${ids.other}/enrollments`, { token: admin });
    const history = enrollmentSchema.array().parse(payload.data);
    assert.equal(history.filter((entry) => entry.classId === after.id).length, 1);
    assert.equal(history.find((entry) => entry.classId === before.id)?.effectiveUntil, target.startsOn);
  } finally {
    await school.close();
  }
});
