import assert from "node:assert/strict";
import { test } from "node:test";
import type { SchoolYear } from "../../packages/contracts/src/school/calendar";
import {
  chooseCalendarYear, calendarMonthCells, monthTeachingCount,
  calendarDayState, asExclusiveEnd, asInclusiveEnd,
} from "../../apps/web/src/features/school/calendar-model";

const active: SchoolYear = {
  id: "b084ff88-7242-4ff0-8cee-d0ad1e04e5f6",
  startsOn: "2026-09-01", endsExclusive: "2027-07-01",
  teachingWeekdays: [1, 2, 5, 6], state: "active", revision: 2,
};
const closed: SchoolYear = { ...active, id: "c184ff88-7242-4ff0-8cee-d0ad1e04e5f6", state: "closed", startsOn: "2025-09-01", endsExclusive: "2026-07-01" };

test("calendar opens the active school year rather than the new-year form", () => {
  assert.equal(chooseCalendarYear([closed, active], "2026-11-22")?.id, active.id);
});

test("month grid starts on Monday and includes all days for the visible month", () => {
  const cells = calendarMonthCells(2026, 11);
  assert.equal(cells[0], null);
  assert.equal(cells[5], null);
  assert.equal(cells[6], "2026-11-01");
  assert.equal(cells.filter(Boolean).length, 30);
});

test("class-specific exception overrides school-wide exception and resetting restores default", () => {
  const events = [
    { id: "a", yearId: active.id, classId: null, schoolDate: "2026-11-28", teaching: false, reason: "Pause", revision: 1 },
    { id: "b", yearId: active.id, classId: "c2", schoolDate: "2026-11-28", teaching: true, reason: "Lesson", revision: 1 },
  ];
  assert.equal(calendarDayState("2026-11-28", active, events, "c2").teaching, true);
  assert.equal(calendarDayState("2026-11-28", active, events, "c3").teaching, false);
  assert.equal(calendarDayState("2026-11-28", active, [], "").teaching, true);
  assert.equal(calendarDayState("2026-11-28", active, events, "c2").exception?.id, "b");
});

test("month teaching count respects overrides and never counts out-of-year dates", () => {
  const ordinary = monthTeachingCount(2026, 11, active, [], "");
  const exception = [{ id: "a", yearId: active.id, classId: null, schoolDate: "2026-11-28", teaching: false, reason: "Holiday", revision: 1 }];
  assert.equal(monthTeachingCount(2026, 11, active, exception, ""), ordinary - 1);
  assert.equal(monthTeachingCount(2026, 8, active, [], ""), 0);
});

test("visible year end uses last included date but API remains exclusive", () => {
  assert.equal(asInclusiveEnd("2027-07-01"), "2027-06-30");
  assert.equal(asExclusiveEnd("2027-06-30"), "2027-07-01");
  assert.equal(asInclusiveEnd("2028-03-01"), "2028-02-29");
});

test("deleting a day requires an existing revision and a valid optional class scope", async () => {
  const { dayDeleteInput } = await import("../../packages/contracts/src/school/calendar");
  assert.deepEqual(dayDeleteInput.parse({ revision: 3, classId: null }), { revision: 3, classId: null });
  assert.equal(dayDeleteInput.safeParse({ revision: -1 }).success, false);
  assert.equal(dayDeleteInput.safeParse({ revision: 1, classId: "any" }).success, false);
});
