import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {test} from "node:test";
import {setUpCalendar} from "../fixtures/calendar";
import {schoolClock as clock} from "../fixtures/clock";
import {schoolFixtures} from "../fixtures/school";
import {fixtureApi} from "../support/api";

test("Admin monitors teaching records without exam, homework or attendance writes",async()=>{
 const school=schoolFixtures();
 try{
   await school.seed();
   const admin=await school.bearer("admin","admin");
   const teacher=await school.bearer("teacher","teacher");
   const {apple,offering}=await setUpCalendar(school,admin);
   const examRequest={
     offeringId:offering.offeringId,date:clock.day,time:"10:00",
     kind:"oral",title:"Synthetic role boundary exam "+randomUUID(),maxScore:20,
   };
   await fixtureApi(school,"/academics/exams",{method:"POST",token:admin,persona:"admin",
     key:randomUUID(),body:examRequest,status:[403,404]});
   await fixtureApi(school,"/academics/homework",{method:"POST",token:admin,persona:"admin",
     key:randomUUID(),body:{offeringId:offering.offeringId,title:"Synthetic admin homework",
       instructions:"must not be created",lessonId:null,issuedOn:clock.day,dueOn:clock.homeworkDue},status:[403,404]});
   const created=await fixtureApi(school,"/academics/exams",{method:"POST",token:teacher,persona:"teacher",
     key:randomUUID(),body:examRequest,status:201});
   const examId=created.payload.data.id;
   const exam=(await fixtureApi(school,`/academics/exams/${examId}`,{token:admin,persona:"admin"})).payload.data;
   assert.equal(exam.canEdit,false);
   assert.equal(exam.canAnnounce,false);
   assert.equal(exam.canMark,false);
   assert.equal(exam.canPublish,false);
   await fixtureApi(school,`/attendance/classes/${apple.id}/days/${clock.day}/open`,
     {method:"POST",token:admin,persona:"admin",key:randomUUID(),body:{},status:[403,404]});
   const opened=await fixtureApi(school,`/attendance/classes/${apple.id}/days/${clock.day}/open`,
     {method:"POST",token:teacher,persona:"teacher",key:randomUUID(),body:{},status:[200,201]});
   const read=(await fixtureApi(school,`/attendance/classes/${apple.id}/days/${clock.day}`,
     {token:admin,persona:"admin"})).payload.data;
   assert.equal(read.canMark,false);
   assert.equal(read.canApprove,false);
   assert.equal(read.state,opened.payload.data.state);
 }finally{await school.close();}
});

test("Supervision overview is admin-only and reports the class and its teacher",async()=>{
 const school=schoolFixtures();
 try{
   await school.seed();
   const admin=await school.bearer("admin","admin");
   const {apple}=await setUpCalendar(school,admin);
   const res=await fixtureApi(school,`/school/oversight?date=${clock.day}`,{token:admin,persona:"admin"});
   assert.equal(res.payload.data.date,clock.day);
   assert.ok(res.payload.data.classes.some((row:{classId:string;teacherName:string|null})=>
     row.classId===apple.id&&row.teacherName!==null));
   const teacher=await school.bearer("teacher","teacher");
   await fixtureApi(school,`/school/oversight?date=${clock.day}`,{token:teacher,persona:"teacher",status:403});
 }finally{await school.close();}
});
