import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { attendanceRowDetail } from "../../packages/contracts/src/attendance/excuses";
import { attendanceSheetSchema } from "../../packages/contracts/src/attendance/sheets";
import { setUpCalendar } from "../fixtures/calendar";
import { schoolClock as clock } from "../fixtures/clock";
import { schoolFixtures } from "../fixtures/school";
import { fixtureApi } from "../support/api";

test("an online guardian excuse locks their pupil, bulk marking skips it, and confirmed arrival wins", async () => {
  const school = schoolFixtures();
  try {
    const admin = await school.bearer("admin", "admin");
    const { apple, ids } = await setUpCalendar(school, admin);
    const teacher = await school.bearer("teacher", "teacher");
    const guardian = await school.bearer("guardian-ar", "guardian");
    const write = (token: string, persona: "teacher" | "guardian", note: string) =>
      ({ token, persona, method: "POST", key: `${school.run}.${note}` }) as const;
    const path = `/attendance/classes/${apple.id}/days/${clock.day}`;
    const opened = await fixtureApi(school, `${path}/open`, write(teacher, "teacher", "open-sheet"));
    const sheet = attendanceSheetSchema.parse(opened.payload.data);
    assert.equal(sheet.rows.length, 2);
    assert.equal(sheet.counts.unmarked, 2);
    const queuePath = `/school/work-queues/unapproved_attendance?asOf=${clock.day}`;
    const queueBefore = await fixtureApi(school, queuePath, {token:admin,persona:"admin"});
    assert.ok(queueBefore.payload.data.items.some((entry: {id:string})=>entry.id===sheet.id));
    await fixtureApi(school, queuePath, {token:teacher,persona:"teacher",status:404});
    const childPath = `/children/${ids.ahmed}/attendance/excuses`;
    const reason = "Synthetic QA excuse";
    await fixtureApi(school, childPath, {
      ...write(guardian, "guardian", "child-excuse"), status: [200, 201], body: { schoolDate: clock.day, reason },
    });
    const reviewed = attendanceSheetSchema.parse((await fixtureApi(school, path, { token: teacher })).payload.data);
    const excused = reviewed.rows.find((row) => row.studentId === ids.ahmed);
    assert.ok(excused?.locked);
    assert.equal(excused.status, "absent_excused");
    const detailPath = `/attendance/rows/${excused.id}`;
    const summary = attendanceRowDetail.parse((await fixtureApi(school, detailPath, { token: teacher })).payload.data);
    assert.equal(summary.excuseReason, null);
    const detail = attendanceRowDetail.parse((await fixtureApi(school, `${detailPath}?detail=private`, { token: teacher })).payload.data);
    assert.equal(detail.excuseReason, reason);

    const bulk = await fixtureApi(school, `/attendance/sheets/${sheet.id}/mark-present`, {
      ...write(teacher, "teacher", "bulk-present"),
      body: { rows: reviewed.rows.map((row) => ({ rowId: row.id, revision: row.revision })) },
    });
    assert.equal(bulk.payload.data.skippedLocked[0].id, excused.id);
    assert.equal(bulk.payload.data.applied[0].studentId, ids.omar);
    const arrival = await fixtureApi(school, `${detailPath}/confirm-arrival`, {
      ...write(teacher, "teacher", "confirm-arrival"), body: { revision: excused.revision, status: "late", confirm: true },
    });
    assert.equal(attendanceRowDetail.parse(arrival.payload.data).row.status, "late");
    await fixtureApi(school, childPath, {
      ...write(guardian, "guardian", randomUUID()), status: 409, body: { schoolDate: clock.day, reason },
    });
    const final = attendanceSheetSchema.parse((await fixtureApi(school, path, { token: teacher })).payload.data);
    assert.equal(final.counts.late, 1);
    assert.equal(final.counts.present, 1);
    assert.equal(final.counts.absent_excused, 0);
    const approved = await fixtureApi(school, `/attendance/sheets/${sheet.id}/approve`, {
      ...write(teacher, "teacher", "approve"),
      body: { approvalRevision: final.approvalRevision, expectedRows: final.rows.map(({ id, revision }) => ({ rowId: id, revision })) },
    });
    assert.equal(attendanceSheetSchema.parse(approved.payload.data).state, "approved");
    const queueAfter = await fixtureApi(school, queuePath, {token:admin,persona:"admin"});
    assert.ok(!queueAfter.payload.data.items.some((entry: {id:string})=>entry.id===sheet.id));
    console.info("Attendance confirmation request", arrival.trace);
  } finally {
    await school.close();
  }
});
