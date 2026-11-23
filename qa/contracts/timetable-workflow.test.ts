import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { assignmentInput, timetableDraftSlot, timetablePatchInput } from "../../packages/contracts/src/index";

const id = () => randomUUID();
const dates = { from:"2026-09-01", untilExclusive:"2027-07-01" };

test("multiple class teachers can be assigned without subject-specific roles", () => {
  const second = assignmentInput.safeParse({
    staffId:id(),kind:"support",subjectId:null,capabilities:["academics.plan","academics.log","academics.grade","academics.publish"],
    ...dates,
  });
  assert.equal(second.success,true);
});

test("one timetable form supports the same subject and time on several weekdays", () => {
  const assignmentId=id(), subjectId=id(), roomId=id();
  const slots=[1,3,5].map(weekday=>({assignmentId,subjectId,roomId,weekday,start:540,end:600,...dates}));
  assert.equal(slots.every(slot=>timetableDraftSlot.safeParse(slot).success),true);
  assert.deepEqual(slots.map(slot=>slot.weekday),[1,3,5]);
});

test("single-date and future-only mutations require an occurrence date and scope", () => {
  const revision=2, date="2026-11-30";
  for (const scope of ["single","future"] as const) {
    assert.equal(timetablePatchInput.safeParse({revision,date,scope,cancel:true}).success,true);
  }
  assert.equal(timetablePatchInput.safeParse({revision,scope:"future",cancel:true}).success,false);
  assert.equal(timetablePatchInput.safeParse({revision,date:"bad",scope:"single",cancel:true}).success,false);
});

test("teacher and subject can be selected independently in the same class", () => {
  const teacherAssignment=id();
  const first=timetableDraftSlot.safeParse({assignmentId:teacherAssignment,subjectId:id(),roomId:id(),weekday:1,start:540,end:600,...dates});
  const second=timetableDraftSlot.safeParse({assignmentId:teacherAssignment,subjectId:id(),roomId:id(),weekday:2,start:540,end:600,...dates});
  assert.equal(first.success,true);
  assert.equal(second.success,true);
  assert.notEqual(first.data?.subjectId,second.data?.subjectId);
});
