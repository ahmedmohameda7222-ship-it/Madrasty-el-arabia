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
  assert.equal(rows.length,2);
  assert.deepEqual(new Set(rows.map(row=>row.classId)),new Set([apple.id,berry.id]));
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
  await fixtureApi(school,`/school/monitor/classes/${apple.id}`,{method:"POST",token:admin,persona:"admin",key:randomUUID(),
    body:{title:"Forbidden monitor write"},status:[404,405]});
 }finally{await school.close();}
});
