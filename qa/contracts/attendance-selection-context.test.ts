import assert from "node:assert/strict";
import {test} from "node:test";
import {readDailyAttendanceContext,writeDailyAttendanceContext} from "../../apps/web/src/features/attendance/daily-context";

test("daily attendance restores chosen class and applied day on return",()=>{
  const start=new URLSearchParams("view=review");
  const next=writeDailyAttendanceContext(start,{classId:"class-1",date:"2026-11-22"});
  assert.deepEqual(readDailyAttendanceContext(next),{classId:"class-1",date:"2026-11-22"});
  assert.equal(next.get("view"),"review");
  assert.equal(start.get("class"),null);
});

test("changing only day retains class and back/forward context",()=>{
  const from=new URLSearchParams("class=class-1&date=2026-11-20&source=dashboard");
  const next=writeDailyAttendanceContext(from,{date:"2026-11-22"});
  assert.equal(next.get("class"),"class-1");
  assert.equal(next.get("date"),"2026-11-22");
  assert.equal(next.get("source"),"dashboard");
});
test("clearing a class preserves the applied day",()=>{
  const next=writeDailyAttendanceContext(new URLSearchParams("class=class-1&date=2026-11-20"),{classId:""});
  assert.equal(next.get("class"),null);
  assert.equal(next.get("date"),"2026-11-20");
});
