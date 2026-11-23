import {expect,test} from "@playwright/test";
import {randomUUID} from "node:crypto";
import {localOrigin} from "../support/target";
import {schoolFixtures} from "../fixtures/school";
import {setUpCalendar} from "../fixtures/calendar";
import {schoolClock as clock} from "../fixtures/clock";
import {fixtureApi} from "../support/api";

async function signInAdmin(context:import("@playwright/test").BrowserContext,token:string){
 await context.addCookies([
  {name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"},
  {name:"madrasty-csrf",value:"a".repeat(64),url:localOrigin,sameSite:"Lax"},
 ]);
}
test("Admin sees class list first, then a read-only class dashboard and student profile",async({page,context})=>{
 const school=schoolFixtures();
 try{
  await school.seed();
  const admin=await school.bearer("admin","admin");
  const {apple,ids}=await setUpCalendar(school,admin);
  await signInAdmin(context,admin);
  await page.goto("/de/school/more/oversight");
  await expect(page.getByRole("heading",{name:"Klassen",exact:true})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Klassenübersicht",exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:new RegExp(apple.code)}).click();
  await expect(page.getByRole("heading",{name:"Klassenübersicht",exact:true})).toBeVisible();
  await expect(page.getByText("Nur ansehen")).toBeVisible();
  await expect(page.getByRole("button",{name:"Prüfung hinzufügen"})).toHaveCount(0);
  await page.getByRole("button",{name:"Schüler",exact:true}).click();
  await page.getByRole("button",{name:"Schülerprofil ansehen"}).first().click();
  await expect(page.getByRole("heading",{name:"Schülerprofil",exact:true})).toBeVisible();
  await expect(page.getByText("Noch kein veröffentlichtes Ergebnis").first()).toBeVisible();
  await page.getByRole("button",{name:"Zurück zur Klasse"}).click();
  await expect(page.getByRole("heading",{name:"Klassenübersicht",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Zurück zu Klassen"}).click();
  await expect(page.getByRole("heading",{name:"Klassen",exact:true})).toBeVisible();
 }finally{await school.close();}
});

test("Admin sees only announced exams for selected class; another class and teacher drafts stay hidden",async({page,context})=>{
 const school=schoolFixtures();
 try {
  await school.seed();
  const admin=await school.bearer("admin","admin");
  const teacher=await school.bearer("teacher","teacher");
  const other=await school.bearer("teacher-other","teacher");
  const {apple,berry,offering,command,ids}=await setUpCalendar(school,admin);
  const staff=(await fixtureApi(school,"/school/staff",{token:admin})).payload.data as {id:string;accountId:string}[];
  const profile=staff.find(s=>s.accountId===ids["teacher-other"]);
  const subjects=(await fixtureApi(school,"/school/subjects",{token:admin})).payload.data as {id:string;code:string}[];
  const fiqh=subjects.find(x=>x.code==="FIQH");
  if(!profile||!fiqh)throw Error("Missing synthetic staff and subjects");
  const berryOffering=await command(`/school/classes/${berry.id}/assignments`,"berry-scope-exam",{
    staffId:profile.id,kind:"subject",subjectId:fiqh.id,
    from:clock.startsOn,untilExclusive:clock.endsExclusive,
    capabilities:["academics.plan","academics.log","academics.grade","academics.publish"],
  });
  const createExam=async(token:string,offeringId:string,title:string,announce:boolean)=>{
    const exam=(await fixtureApi(school,"/academics/exams",{method:"POST",token,persona:"teacher",key:randomUUID(),
      body:{offeringId,date:clock.day,time:"10:00",kind:"oral",title,maxScore:20},status:201})).payload.data;
    if(announce)await fixtureApi(school,`/academics/exams/${exam.id}/announce`,{
      method:"POST",token,persona:"teacher",key:randomUUID(),
      body:{revision:exam.revision,date:clock.day,time:"10:00"},status:200});
  };
  await createExam(teacher,offering.offeringId,"APPLE CLASS PUBLIC EXAM",true);
  await createExam(other,berryOffering.offeringId,"BERRY CLASS PUBLIC EXAM",true);
  await createExam(other,berryOffering.offeringId,"PRIVATE BERRY DRAFT EXAM",false);
  await signInAdmin(context,admin);
  await page.goto("/de/school/more/oversight");
  await page.getByRole("button",{name:new RegExp(berry.code)}).click();
  await page.getByRole("button",{name:"Prüfungen und Noten"}).click();
  await expect(page.getByText("BERRY CLASS PUBLIC EXAM")).toBeVisible();
  await expect(page.getByText("APPLE CLASS PUBLIC EXAM")).toHaveCount(0);
  await expect(page.getByText("PRIVATE BERRY DRAFT EXAM")).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Prüfung hinzufügen"})).toHaveCount(0);
 }finally{await school.close();}
});
