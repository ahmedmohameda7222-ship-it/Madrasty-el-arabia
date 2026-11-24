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
  const {apple,year}=await setUpCalendar(school,admin);
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
  const financeAdmin=await school.bearer("finance","admin");
  const limited=(await fixtureApi(school,"/school/work-queues",{token:financeAdmin})).payload.data;
  assert.equal(limited.overview.attendance,null);
  assert.ok(limited.overview.finance);
  const dayPath=`/attendance/classes/${apple.id}/days/${clock.day}`;
  const write=(suffix:string)=>({method:"POST" as const,token:teacher,persona:"teacher" as const,key:school.run+".dashboard."+suffix});
  const opened=(await fixtureApi(school,dayPath+"/open",{...write("open"),body:{},status:[200,201]})).payload.data;
  await fixtureApi(school,`/attendance/sheets/${opened.id}/mark-present`,{...write("mark"),body:{
    rows:opened.rows.map((row:{id:string;revision:number})=>({rowId:row.id,revision:row.revision}))
  }});
  const draft=(await fixtureApi(school,"/school/work-queues",{token:admin})).payload.data.overview.attendance;
  assert.equal(draft.approvedClasses,0);
  assert.equal(draft.present,0);
  const marked=(await fixtureApi(school,dayPath,{token:teacher})).payload.data;
  await fixtureApi(school,`/attendance/sheets/${opened.id}/approve`,{...write("approve"),body:{
    approvalRevision:marked.approvalRevision,expectedRows:marked.rows.map((row:{id:string;revision:number})=>({rowId:row.id,revision:row.revision}))
  }});
  const approved=(await fixtureApi(school,"/school/work-queues",{token:admin})).payload.data.overview.attendance;
  assert.equal(approved.approvedClasses,1);
  assert.equal(approved.present,2);
  assert.equal(approved.expectedClasses,2);
  await fixtureApi(school,`/school/years/${year.id}/days/${clock.holiday}`,{
    method:"PUT",token:admin,persona:"admin",key:school.run+".dashboard.holiday",body:{teaching:false,reason:"QA holiday",revision:0}
  });
  const afterHoliday=(await fixtureApi(school,"/school/work-queues",{token:admin})).payload.data.overview.schoolDays;
  assert.ok(afterHoliday.next>clock.holiday);
  for(const token of [teacher,guardian]){
   const other=(await fixtureApi(school,"/school/work-queues",{token})).payload.data;
   assert.equal(other.overview,undefined);
   assert.deepEqual(other.queues,[]);
  }
 }finally{await school.close();}
});
