import assert from "node:assert/strict";
import {test} from "node:test";
import {createSchoolClock} from "../fixtures/clock";

test("QA school date uses the Berlin calendar even after UTC midnight",()=>{
  const clock=createSchoolClock(new Date("2026-11-21T23:30:00Z"));
  assert.equal(clock.day,"2026-11-22");
  assert.equal(clock.weekday,7);
  assert.equal(clock.holiday,"2026-11-23");
  assert.equal(clock.weekOf,"2026-11-16");
  assert.equal(clock.homeworkDue,"2026-11-29");
  assert.equal(clock.month,"2026-11");
  assert.equal(clock.nextMonth,"2026-12");
  assert.equal(clock.startsOn,"2026-11-01");
  assert.equal(clock.endsExclusive,"2027-01-01");
});
test("QA schedule and billing dates roll into the new year together",()=>{
  const clock=createSchoolClock(new Date("2026-12-31T23:30:00Z"));
  assert.equal(clock.day,"2027-01-01");
  assert.equal(clock.weekday,5);
  assert.equal(clock.weekOf,"2026-12-28");
  assert.equal(clock.month,"2027-01");
  assert.equal(clock.nextMonth,"2027-02");
  assert.equal(clock.endsExclusive,"2027-03-01");
});
