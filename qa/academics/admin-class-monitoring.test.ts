import assert from "node:assert/strict";
import {test} from "node:test";
import {randomUUID} from "node:crypto";
import {setUpCalendar} from "../fixtures/calendar";
import {schoolClock as clock} from "../fixtures/clock";
import {schoolFixtures} from "../fixtures/school";
import {fixtureApi} from "../support/api";

test("Admin class list is class-first and restricted to monitoring role",async()=>{
 const school=schoolFixtures();
 try{
  await school.seed();
  const admin=await school.bearer("admin","admin");
  const teacher=await school.bearer("teacher","teacher");
  const {year,apple,berry}=await setUpCalendar(school,admin);
  const result=await fixtureApi(school,`/school/monitor/classes?yearId=${year.id}`,{token:admin,persona:"admin"});
  const rows=result.payload.data as {classId:string;studentCount:number;teacherName:string|null}[];
  assert.ok(rows.length>=2);
  assert.ok(rows.some(row=>row.classId===apple.id));
  assert.ok(rows.some(row=>row.classId===berry.id));
  assert.ok(rows.find(row=>row.classId===apple.id)?.studentCount===2);
  assert.ok(rows.find(row=>row.classId===apple.id)?.teacherName);
  await fixtureApi(school,`/school/monitor/classes?yearId=${year.id}`,{token:teacher,persona:"teacher",status:403});
 }finally{await school.close();}
});

test("Admin class monitoring never serializes draft exam or evaluation content",async()=>{
 const school=schoolFixtures();
 try{
  await school.seed();
  const admin=await school.bearer("admin","admin");
  const teacher=await school.bearer("teacher","teacher");
  const {apple,berry,offering,ids}=await setUpCalendar(school,admin);
  const examDraftTitle="PRIVATE DRAFT EXAM "+randomUUID();
  const evaluationDraftTitle="PRIVATE DRAFT EVALUATION "+randomUUID();
  const exam=(await fixtureApi(school,"/academics/exams",{method:"POST",token:teacher,persona:"teacher",key:randomUUID(),
    body:{offeringId:offering.offeringId,date:clock.day,time:"10:00",kind:"oral",title:examDraftTitle,maxScore:20},status:201})).payload.data;
  await fixtureApi(school,"/academics/evaluations",{method:"POST",token:teacher,persona:"teacher",key:randomUUID(),
    body:{offeringId:offering.offeringId,studentId:ids.ahmed,periodStart:clock.day,periodEnd:clock.day,
      title:evaluationDraftTitle,participation:4,understanding:3,preparation:5,strengths:"PRIVATE DRAFT STRENGTHS",improvements:"PRIVATE DRAFT NOTES"},status:201});
  const dashboard=(await fixtureApi(school,`/school/monitor/classes/${apple.id}`,{token:admin,persona:"admin"})).payload.data;
  assert.equal(dashboard.classroom.classId,apple.id);
  assert.equal(dashboard.students.length,2);
  assert.equal(JSON.stringify(dashboard).includes(examDraftTitle),false);
  assert.equal(JSON.stringify(dashboard).includes(evaluationDraftTitle),false);
  const pupil=(await fixtureApi(school,`/school/monitor/classes/${apple.id}/students/${ids.ahmed}`,
    {token:admin,persona:"admin"})).payload.data;
  assert.equal(pupil.student.studentId,ids.ahmed);
  assert.equal(JSON.stringify(pupil).includes(evaluationDraftTitle),false);
  assert.equal(JSON.stringify(pupil).includes("PRIVATE DRAFT"),false);
  await fixtureApi(school,`/school/monitor/classes/${berry.id}/students/${ids.ahmed}`,
    {token:admin,persona:"admin",status:404});
  await fixtureApi(school,`/school/monitor/classes/${apple.id}`,{token:teacher,persona:"teacher",status:403});
  await fixtureApi(school,`/school/monitor/classes/${apple.id}/students/${ids.ahmed}`,
    {token:teacher,persona:"teacher",status:403});
  const deniedWrite=await fetch(`${school.origin}/api/v1/school/monitor/classes/${apple.id}`,{
    method:"POST",headers:{authorization:`Bearer ${admin}`,"x-school-persona":"admin",
      "content-type":"application/json"},body:JSON.stringify({title:"Forbidden monitor write"}),
  });
  assert.ok([404,405].includes(deniedWrite.status));
 }finally{await school.close();}
});

test("Admin sees an announced exam and only published scores and evaluations",async()=>{
 const school=schoolFixtures();
 try{
  await school.seed();
  const admin=await school.bearer("admin","admin");
  const teacher=await school.bearer("teacher","teacher");
  const {apple,offering,ids}=await setUpCalendar(school,admin);
  const created=(await fixtureApi(school,"/academics/exams",{method:"POST",token:teacher,persona:"teacher",
    key:randomUUID(),body:{offeringId:offering.offeringId,date:clock.day,time:"11:00",kind:"oral",
      title:"Published class oral test",maxScore:20},status:201})).payload.data;
  let data=(await fixtureApi(school,`/school/monitor/classes/${apple.id}`,{token:admin,persona:"admin"})).payload.data;
  assert.equal(data.exams.some((exam:{id:string})=>exam.id===created.id),false);
  const announce=(await fixtureApi(school,`/academics/exams/${created.id}/announce`,{
    method:"POST",token:teacher,persona:"teacher",key:randomUUID(),
    body:{revision:created.revision,date:clock.day,time:"11:00"},status:200})).payload.data;
  data=(await fixtureApi(school,`/school/monitor/classes/${apple.id}`,{token:admin,persona:"admin"})).payload.data;
  assert.equal(data.exams.some((exam:{id:string})=>exam.id===created.id),true);
  const roster=(await fixtureApi(school,`/academics/exams/${created.id}/marks`,{token:teacher,persona:"teacher"})).payload.data;
  const pupil=roster.find((row:{studentId:string})=>row.studentId===ids.ahmed);
  assert.ok(pupil);
  const marked=(await fixtureApi(school,`/academics/exams/${created.id}/marks/${ids.ahmed}`,{
    method:"PUT",token:teacher,persona:"teacher",key:randomUUID(),
    body:{revision:pupil.revision,score:16.5,feedback:"Published score feedback"},status:200})).payload.data;
  const profilePath=`/school/monitor/classes/${apple.id}/students/${ids.ahmed}`;
  let profile=(await fixtureApi(school,profilePath,{token:admin,persona:"admin"})).payload.data;
  assert.equal(profile.exams.length,0,"Unpublished mark must never leave Admin API");
  const classBeforePublication=(await fixtureApi(school,`/school/monitor/classes/${apple.id}`,{
    token:admin,persona:"admin",
  })).payload.data;
  const examBefore=classBeforePublication.exams.find((row:{id:string})=>row.id===created.id);
  assert.equal(examBefore?.publishedResults.length,0);
  assert.equal(JSON.stringify(classBeforePublication).includes("Published score feedback"),false);
  await fixtureApi(school,`/academics/exams/${created.id}/results/publish`,{
    method:"POST",token:teacher,persona:"teacher",key:randomUUID(),
    body:{revision:announce.revision,reviewedRows:[{studentId:ids.ahmed,revision:marked.revision}]},status:200});
  profile=(await fixtureApi(school,profilePath,{token:admin,persona:"admin"})).payload.data;
  assert.equal(profile.exams.find((exam:{id:string})=>exam.id===created.id)?.score,16.5);
  const classAfterPublication=(await fixtureApi(school,`/school/monitor/classes/${apple.id}`,{
    token:admin,persona:"admin",
  })).payload.data;
  const examAfter=classAfterPublication.exams.find((row:{id:string})=>row.id===created.id);
  assert.equal(examAfter.publishedResults.find((row:{studentId:string})=>row.studentId===ids.ahmed)?.score,16.5);
  assert.equal(examAfter.publishedResults.find((row:{studentId:string})=>row.studentId===ids.ahmed)?.feedback,
    "Published score feedback");
  const evaluationProfilePath=`/school/monitor/classes/${apple.id}/students/${ids.omar}`;
  const assessment=(await fixtureApi(school,"/academics/evaluations",{
    method:"POST",token:teacher,persona:"teacher",key:randomUUID(),status:201,
    body:{offeringId:offering.offeringId,studentId:ids.omar,periodStart:clock.day,periodEnd:clock.day,
      title:"Official progress",participation:5,understanding:4,preparation:3,
      strengths:"Published strengths",improvements:"Published goals"}})).payload.data;
  const pendingEvaluation=(await fixtureApi(school,evaluationProfilePath,{token:admin,persona:"admin"})).payload.data;
  assert.equal(pendingEvaluation.evaluations.some((row:{id:string})=>row.id===assessment.id),false,"Evaluation draft must stay private");
  await fixtureApi(school,`/academics/evaluations/${assessment.id}/publish`,{
    method:"POST",token:teacher,persona:"teacher",key:randomUUID(),
    body:{revision:assessment.revision},status:200});
  const publishedEvaluation=(await fixtureApi(school,evaluationProfilePath,{token:admin,persona:"admin"})).payload.data;
  const official=publishedEvaluation.evaluations.find((row:{id:string})=>row.id===assessment.id);
  assert.equal(official?.title,"Official progress");
  assert.equal(official?.strengths,"Published strengths");
  assert.equal(JSON.stringify(publishedEvaluation).includes("private_reason"),false);
 }finally{await school.close();}
});

test("Admin sees attendance rows only after approval, not while the sheet is open",async()=>{
 const school=schoolFixtures();
 try{
  await school.seed();
  const admin=await school.bearer("admin","admin");
  const teacher=await school.bearer("teacher","teacher");
  const {apple,ids}=await setUpCalendar(school,admin);
  // Use a distinct day in the current billing month, never a future month.
  // A published roster is immutable. A later finance suite must be able to
  // declare a next-month pause without corrupting this official evidence.
  const dayOfMonth=Number(clock.day.slice(8,10));
  const day=clock.month+"-"+String(dayOfMonth>2?dayOfMonth-2:dayOfMonth+2).padStart(2,"0");
  const daily=`/attendance/classes/${apple.id}/days/${day}`;
  const opened=(await fixtureApi(school,daily+"/open",{
    method:"POST",token:teacher,persona:"teacher",key:randomUUID(),body:{},status:[200,201]})).payload.data;
  const before=(await fixtureApi(school,`/school/monitor/classes/${apple.id}`,{token:admin,persona:"admin"})).payload.data;
  assert.equal(before.attendance.length,0);
  assert.equal(before.lastAttendance,null);
  await fixtureApi(school,`/attendance/sheets/${opened.id}/mark-present`,{
    method:"POST",token:teacher,persona:"teacher",key:randomUUID(),
    body:{rows:opened.rows.map((row:{id:string;revision:number})=>({rowId:row.id,revision:row.revision}))},status:200});
  const ready=(await fixtureApi(school,daily,{token:teacher,persona:"teacher"})).payload.data;
  const stillPrivate=(await fixtureApi(school,`/school/monitor/classes/${apple.id}`,{token:admin,persona:"admin"})).payload.data;
  assert.equal(stillPrivate.attendance.length,0);
  await fixtureApi(school,`/attendance/sheets/${opened.id}/approve`,{
    method:"POST",token:teacher,persona:"teacher",key:randomUUID(),
    body:{approvalRevision:ready.approvalRevision,
      expectedRows:ready.rows.map((row:{id:string;revision:number})=>({rowId:row.id,revision:row.revision}))},status:200});
  const after=(await fixtureApi(school,`/school/monitor/classes/${apple.id}`,{token:admin,persona:"admin"})).payload.data;
  assert.equal(after.attendance.filter((row:{date:string})=>row.date===day).length,opened.rows.length);
  assert.equal(after.lastAttendance.date,day);
  assert.equal(after.lastAttendance.present,ready.counts.present);
  assert.equal(after.lastAttendance.absentExcused,ready.counts.absent_excused);
  assert.equal(after.lastAttendance.late,ready.counts.late);
  assert.equal(after.lastAttendance.absentUnexcused,ready.counts.absent_unexcused);
  const legacyOverview=(await fixtureApi(school,`/school/oversight?date=${day}`,
    {token:admin,persona:"admin"})).payload.data;
  const approvedLegacy=legacyOverview.classes.find((row:{classId:string})=>row.classId===apple.id);
  assert.ok(approvedLegacy);
  assert.equal(approvedLegacy.attendanceState,"approved",
    "An approved sheet must remain available to administrative monitoring");
  assert.equal(approvedLegacy.unmarkedCount,0);
  const student=(await fixtureApi(school,`/school/monitor/classes/${apple.id}/students/${ids.ahmed}`,
    {token:admin,persona:"admin"})).payload.data;
  assert.equal(student.attendance.find((entry:{date:string})=>entry.date===day)?.status,
    ready.rows.find((entry:{studentId:string})=>entry.studentId===ids.ahmed)?.status);
 }finally{await school.close();}
});
