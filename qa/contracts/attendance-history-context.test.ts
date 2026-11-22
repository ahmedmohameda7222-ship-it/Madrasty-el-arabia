import assert from "node:assert/strict";
import {test} from "node:test";
import {readAttendanceHistoryFilters,writeAttendanceHistoryFilters} from "../../apps/web/src/features/attendance/history-context";

test("attendance history restores applied filters without dropping class or row deep links",()=>{
  const original=new URLSearchParams("class=section-42&row=record-7");
  const written=writeAttendanceHistoryFilters(original,{from:"2026-11-01",to:"2026-11-22",status:"absent_excused"});
  assert.deepEqual(readAttendanceHistoryFilters(written),{from:"2026-11-01",to:"2026-11-22",status:"absent_excused"});
  assert.equal(written.get("class"),"section-42");
  assert.equal(written.get("row"),"record-7");
  assert.equal(original.get("from"),null);
});

test("clearing attendance filters removes only their keys",()=>{
  const params=new URLSearchParams("class=section-42&from=2026-11-01&to=2026-11-22&status=late");
  const written=writeAttendanceHistoryFilters(params,{from:"",to:"",status:""});
  assert.equal(written.toString(),"class=section-42");
  assert.deepEqual(readAttendanceHistoryFilters(written),{from:"",to:"",status:""});
});
