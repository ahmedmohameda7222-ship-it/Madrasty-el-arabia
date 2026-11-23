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
   // An administrative supervisor can inspect an offering, but never receives
   // teacher authoring flags, even with academics.supervise.
   const offerings=(await fixtureApi(school,"/academics/offerings",{
     token:admin,persona:"admin",
   })).payload.data as {id:string;canPlan:boolean;canPublish:boolean;canLog:boolean;canGrade:boolean}[];
   const monitored=offerings.find(row=>row.id===offering.offeringId);
   assert.ok(monitored,"Admin should see the class offering");
   assert.deepEqual({
     canPlan:monitored.canPlan,canPublish:monitored.canPublish,
     canLog:monitored.canLog,canGrade:monitored.canGrade,
   },{canPlan:false,canPublish:false,canLog:false,canGrade:false});
   // Legacy teacher endpoints contain working drafts: no Admin can retrieve them.
   await fixtureApi(school,`/academics/exams/${examId}`,{token:admin,persona:"admin",status:403});
   await fixtureApi(school,"/academics/exams?limit=20",{token:admin,persona:"admin",status:403});
   await fixtureApi(school,`/academics/exams/${examId}/marks`,{token:admin,persona:"admin",status:403});
   await fixtureApi(school,"/academics/evaluations?limit=20",{token:admin,persona:"admin",status:403});
   await fixtureApi(school,"/academics/grading?limit=20",{token:admin,persona:"admin",status:403});
   await fixtureApi(school,`/attendance/classes/${apple.id}/days/${clock.day}/open`,
     {method:"POST",token:admin,persona:"admin",key:randomUUID(),body:{},status:[403,404]});
   const opened=await fixtureApi(school,`/attendance/classes/${apple.id}/days/${clock.day}/open`,
     {method:"POST",token:teacher,persona:"teacher",key:randomUUID(),body:{},status:[200,201]});
   // Open sheets are teacher working data, not a published Admin record.
   await fixtureApi(school,`/attendance/classes/${apple.id}/days/${clock.day}`,
     {token:admin,persona:"admin",status:403});
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

test("Admin cannot correct or cancel approved attendance by calling legacy write endpoints",async()=>{
 const school=schoolFixtures();
 try{
   await school.seed();
   const admin=await school.bearer("admin","admin");
   await fixtureApi(school,`/attendance/rows/${randomUUID()}/corrections`,{
     method:"POST",token:admin,persona:"admin",key:randomUUID(),
     body:{revision:1,status:"present",reason:"Forbidden Admin change"},status:403,
   });
   await fixtureApi(school,`/attendance/sheets/${randomUUID()}/cancel-for-calendar`,{
     method:"POST",token:admin,persona:"admin",key:randomUUID(),
     body:{approvalRevision:1,reason:"Admin cannot alter attendance"},status:403,
   });
 }finally{await school.close();}
});
