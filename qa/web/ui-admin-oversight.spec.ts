import {expect,test} from "@playwright/test";
import {localOrigin} from "../support/target";
import {schoolFixtures} from "../fixtures/school";
import {setUpCalendar} from "../fixtures/calendar";
import {schoolClock as clock} from "../fixtures/clock";
import {fixtureApi} from "../support/api";
import {randomUUID} from "node:crypto";

test("Admin gets read-only oversight, not teacher grading actions",async({page,context})=>{
 const school=schoolFixtures();
 try{
  await school.seed();
  const admin=await school.bearer("admin","admin");
  await setUpCalendar(school,admin);
  await context.addCookies([
    {name:"madrasty-session",value:admin,url:localOrigin,httpOnly:true,sameSite:"Lax"},
    {name:"madrasty-csrf",value:"a".repeat(64),url:localOrigin,sameSite:"Lax"},
  ]);
  await page.goto("/de/school/more");
  await page.getByText("Unterricht und Anwesenheit",{exact:true}).click();
  await expect(page.getByRole("link",{name:"Unterricht im Blick"})).toBeVisible();
  await expect(page.getByRole("link",{name:"Hausaufgaben korrigieren"})).toHaveCount(0);
  await page.getByRole("link",{name:"Unterricht im Blick"}).click();
  await expect(page.getByRole("heading",{name:"Unterricht im Blick"})).toBeVisible();
  await expect(page.getByText("Nur ansehen")).toBeVisible();
  await expect(page.getByRole("heading",{name:"Klassenübersicht"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Prüfung hinzufügen"})).toHaveCount(0);
  // The Admin must still reach an actual read-only exam list.
  await page.getByRole("link",{name:"Prüfungen ansehen"}).click();
  await expect(page.getByText("Prüfungen dieser Klasse · Nur ansehen")).toBeVisible();
  await expect(page.getByRole("button",{name:"Prüfung hinzufügen"})).toHaveCount(0);
 }finally{await school.close();}
});


test("Admin exam drilldown stays inside the selected classroom",async({page,context})=>{
 const school=schoolFixtures();
 try {
  await school.seed();
  const admin=await school.bearer("admin","admin");
  const appleTeacher=await school.bearer("teacher","teacher");
  const berryTeacher=await school.bearer("teacher-other","teacher");
  const {apple,berry,offering,command,ids}=await setUpCalendar(school,admin);
  const staff=(await fixtureApi(school,"/school/staff",{token:admin})).payload.data as {id:string;accountId:string}[];
  const berryStaff=staff.find(p=>p.accountId===ids["teacher-other"]);
  const subjects=(await fixtureApi(school,"/school/subjects",{token:admin})).payload.data as {id:string;code:string}[];
  const fiqh=subjects.find(p=>p.code==="FIQH");
  const seerah=subjects.find(p=>p.code==="SEERAH");
  if(!berryStaff||!fiqh||!seerah)throw new Error("Synthetic staff and subjects missing");
  const assigned=await command(`/school/classes/${berry.id}/assignments`,"berry-exam-offering",{
    staffId:berryStaff.id,kind:"subject",subjectId:fiqh.id,
    from:clock.startsOn,untilExclusive:clock.endsExclusive,
    capabilities:["academics.plan","academics.log","academics.grade","academics.publish"],
  });
  const secondOffering=await command(`/school/classes/${berry.id}/assignments`,"berry-seerah-offering",{
    staffId:berryStaff.id,kind:"subject",subjectId:seerah.id,
    from:clock.startsOn,untilExclusive:clock.endsExclusive,
    capabilities:["academics.plan","academics.log","academics.grade","academics.publish"],
  });
  const createExam=async(token:string,offeringId:string,title:string)=>{
    await fixtureApi(school,"/academics/exams",{method:"POST",token,persona:"teacher",key:randomUUID(),
      body:{offeringId,date:clock.day,time:"10:00",kind:"oral",title,maxScore:20},status:201});
  };
  await createExam(appleTeacher,offering.offeringId,"Synthetic APPLE classroom exam");
  await createExam(berryTeacher,assigned.offeringId,"Synthetic BERRY classroom exam");
  await createExam(berryTeacher,secondOffering.offeringId,"Synthetic BERRY SEERAH classroom exam");
  await context.addCookies([
    {name:"madrasty-session",value:admin,url:localOrigin,httpOnly:true,sameSite:"Lax"},
    {name:"madrasty-csrf",value:"a".repeat(64),url:localOrigin,sameSite:"Lax"},
  ]);
  await page.goto("/de/school/more/oversight");
  await page.getByRole("button",{name:/QA_B/}).click();
  await page.getByRole("link",{name:"Prüfungen ansehen"}).click();
  await expect(page).toHaveURL(`/de/school/more/exams?class=${berry.id}`);
  await expect(page.getByText("Synthetic BERRY classroom exam")).toBeVisible();
  await expect(page.getByText("Synthetic BERRY SEERAH classroom exam")).toBeVisible();
  await expect(page.getByText("Synthetic APPLE classroom exam")).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Prüfung hinzufügen"})).toHaveCount(0);
 }finally{await school.close();}
});
