import assert from "node:assert/strict";
import {test} from "node:test";
import {schoolFixtures} from "../fixtures/school";
import {setUpCalendar} from "../fixtures/calendar";
import {fixtureApi} from "../support/api";
import {schoolClock as clock} from "../fixtures/clock";

test("admin start exposes calendar and scoped aggregates without draft attendance or pause review tasks",async()=>{
 const school=schoolFixtures();
 try{
  await school.seed();
  const admin=await school.bearer("admin","admin");
  const teacher=await school.bearer("teacher","teacher");
  const guardian=await school.bearer("guardian-ar","guardian");
  await setUpCalendar(school,admin);
  const data=(await fixtureApi(school,"/school/work-queues",{token:admin})).payload.data;
  assert.ok(data.overview);
  assert.ok(data.overview.schoolDays);
  assert.equal(data.overview.schoolDays.last,clock.day);
  assert.equal(data.overview.schoolDays.next,clock.holiday);
  assert.equal(data.overview.attendance.approvedClasses,0);
  assert.equal(data.overview.attendance.present,0);
  assert.equal(data.overview.attendance.expectedClasses,2);
  assert.equal(data.queues.some((row:{key:string})=>row.key==="noncontinuation_requests"),false);
  assert.ok(data.overview.finance);
  assert.equal(data.overview.finance.month,clock.month);
  for(const token of [teacher,guardian]){
   const other=(await fixtureApi(school,"/school/work-queues",{token})).payload.data;
   assert.equal(other.overview,undefined);
   assert.deepEqual(other.queues,[]);
  }
 }finally{await school.close();}
});
