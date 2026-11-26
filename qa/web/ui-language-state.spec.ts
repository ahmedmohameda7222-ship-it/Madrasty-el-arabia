import { expect,test,type Page } from "@playwright/test";
import { schoolFixtures,type FixtureSchool } from "../fixtures/school";
import { fixtureEmail } from "../support/target";
import {fixtureApi} from "../support/api";
import {setUpCalendar} from "../fixtures/calendar";
import {randomUUID} from "node:crypto";

test("language switch keeps an unsaved family wizard and signed-in session",async({page,context})=>{
 test.setTimeout(90000);
 const school=schoolFixtures();
 try{
  await school.seed();
  await signIn(page,school,"admin");
  await expect(page.locator(".admin-start-actions a[href$='/students?add=family']")).toBeVisible({timeout:20000});
  await page.locator(".admin-start-actions a[href$='/students?add=family']").click();
  await expect(page.locator(".family-wizard")).toBeVisible();
  await page.getByRole("textbox",{name:"Familienname",exact:true}).fill("QA Unsent Family");
  await page.getByRole("combobox",{name:"Familiensituation (optional)"}).selectOption("divorced");
  await page.getByRole("button",{name:"Weiter",exact:true}).click();
  const field=page.locator('input[name="guardian1Name"]');
  await field.fill("QA Unsaved Parent");
  await page.locator('input[name="guardian1Email"]').fill("unsent@example.invalid");
  const url=page.url();
  await page.evaluate(()=>{(window as Window & {languageTestSentinel?:boolean}).languageTestSentinel=true;});
  await toggle(page,"ar");
  await expect(page.locator("html")).toHaveAttribute("lang","ar");
  await expect(page.locator("html")).toHaveAttribute("dir","rtl");
  await expect(page.locator(".family-step-caption")).toContainText("2 / 5");
  await expect(field).toHaveValue("QA Unsaved Parent");
  await expect(page.locator('input[name="guardian1Email"]')).toHaveValue("unsent@example.invalid");
  expect(page.url()).toBe(url);
  expect(await page.evaluate(()=>(window as Window & {languageTestSentinel?:boolean}).languageTestSentinel)).toBe(true);
  await toggle(page,"de");
  await expect(page.locator("html")).toHaveAttribute("lang","de");
  await expect(field).toHaveValue("QA Unsaved Parent");
  await page.getByRole("button",{name:"Zurück",exact:true}).last().click();
  await expect(page.getByRole("textbox",{name:"Familienname",exact:true})).toHaveValue("QA Unsent Family");
  await expect(page.getByRole("combobox",{name:"Familiensituation (optional)"})).toHaveValue("divorced");
  await expect(page.locator(".school-nav")).toBeVisible();
  expect(await page.locator(".school-nav [aria-current=page]").getAttribute("href")).toContain("/school/students");
  const importPage=await context.newPage();
  try{
    await importPage.goto("/de/school/students/import");
    const csv="childKey,childName,guardianKey,guardianName,email,communicationLocale\nC1,QA Child,G1,QA Parent,qa@example.invalid,de";
    await importPage.locator('input[type="file"]').setInputFiles({name:"language-draft.csv",mimeType:"text/csv",buffer:Buffer.from(csv)});
    await expect(importPage.getByRole("button",{name:"language-draft.csv"})).toBeVisible();
    await toggle(importPage,"ar");
    await expect(importPage.getByRole("button",{name:"language-draft.csv"})).toBeVisible();
    expect(await importPage.locator('input[type="file"]').evaluate((el:HTMLInputElement)=>el.files?.[0]?.name)).toBe("language-draft.csv");
    await toggle(importPage,"de");
    await importPage.getByRole("button",{name:"Datei hochladen",exact:true}).click();
    await expect(importPage.locator(".family-import h2")).toHaveText("Spalten zuordnen",{timeout:30000});
    const mapped=importPage.locator(".family-import select").last();
    const chosen=await mapped.locator("option").last().getAttribute("value");expect(chosen).toBeTruthy();
    await mapped.selectOption(chosen!);
    const importUrl=importPage.url();
    await toggle(importPage,"ar");
    await expect(mapped).toHaveValue(chosen!);expect(importPage.url()).toBe(importUrl);
    await toggle(importPage,"de");
    await expect(mapped).toHaveValue(chosen!);
  }finally{await importPage.close();}
 }finally{await school.close();}
});

async function signIn(page:Page,school:FixtureSchool,principal:"admin"|"guardian-de"){
  // Enroll the synthetic admin fixture before sign-in; localMfa reads its saved factor.
  if(principal==="admin")await school.bearer("admin","admin");
  await page.goto("/de/account/sign-in");
  await page.locator('input[name="email"]').fill(fixtureEmail(school.run,principal));
  await page.locator('input[name="password"]').fill(school.password);
  await page.getByRole("button",{name:"Anmelden",exact:true}).click();
  if(principal==="admin"){
    await expect(page).toHaveURL(/\/de\/account\/security$/,{timeout:20000});
    const enrolled=await school.localMfa("admin");
    await page.locator('input[name="code"]').fill(enrolled.code());
    await page.getByRole("button",{name:"Bestätigen",exact:true}).click();
  }
  await expect(page.locator(".school-nav")).toBeVisible({timeout:20000});
}
async function toggle(page:Page,target:"ar"|"de"){
 const url=page.url();
 const header=page.locator(".school-header");
 await expect(header.getByRole("button",{name:"العربية",exact:true})).toHaveCount(0);
 await expect(header.getByRole("button",{name:"Deutsch",exact:true})).toHaveCount(0);
 await header.getByRole("button",{name:target==="ar"?"App-Einstellungen":"إعدادات التطبيق",exact:true}).click();
 const settings=page.locator(".app-settings-sheet");await expect(settings).toBeVisible();
 if(await page.locator(".school-nav").count())await expect(settings.getByRole("heading",{name:target==="ar"?"Gerätebenachrichtigungen":"إشعارات الجهاز"})).toBeVisible();
 await settings.getByRole("button",{name:target==="ar"?"العربية":"Deutsch",exact:true}).click();
 await expect(page.locator("html")).toHaveAttribute("lang",target);
 await expect(page.locator("html")).toHaveAttribute("dir",target==="ar"?"rtl":"ltr");
 await expect(settings.getByRole("button",{name:target==="ar"?"العربية":"Deutsch",exact:true})).toHaveAttribute("aria-pressed","true");
 await settings.getByRole("button",{name:target==="ar"?"إغلاق":"Schließen",exact:true}).click();
 await expect(settings).not.toBeVisible();
 expect(page.url()).toBe(url);
}
test("sign-in fields and password visibility are not reset by language",async({page})=>{
 await page.goto("/de/account/sign-in");
 await expect(page.getByRole("button",{name:"Anmelden",exact:true})).toBeEnabled();
 const email=page.locator('input[name="email"]'),password=page.locator('input[name="password"]');
 await email.fill("not-a-real-user@example.invalid");await password.fill("synthetic-example-only");
 await page.getByRole("button",{name:"Anzeigen",exact:true}).click();
 await toggle(page,"ar");
 await expect(email).toHaveValue("not-a-real-user@example.invalid");await expect(password).toHaveValue("synthetic-example-only");
 await expect(password).toHaveAttribute("type","text");
 await toggle(page,"de");await expect(password).toHaveValue("synthetic-example-only");
});
test("guardian chat keeps unsent message and current thread after repeated language changes",async({page})=>{
 test.setTimeout(90000);const school=schoolFixtures();
 try{
  await school.seed();const admin=await school.bearer("admin","admin");await setUpCalendar(school,admin);
  const guardian=await school.bearer("guardian-de","guardian");
  const contacts=(await fixtureApi(school,"/directory",{token:guardian})).payload.data;
  const target=contacts.find((c:{displayName:string})=>c.displayName==="يوسف عبد الرحمن محمود").target;
  const thread=(await fixtureApi(school,"/threads",{token:guardian,persona:"guardian",method:"POST",key:randomUUID(),body:{target}})).payload.data.threadId;
  const key=randomUUID();
  await fixtureApi(school,`/threads/${thread}/messages`,{token:guardian,persona:"guardian",method:"POST",key,status:201,body:{clientMessageId:key,body:"QA Existing message"}});
  await signIn(page,school,"guardian-de");
  await page.locator('nav a[href$="/school/messages"]').click();
  const row=page.locator(".comms-thread-row").filter({hasText:"QA Existing message"});await expect(row).toBeVisible();await row.click();
  await expect.poll(()=>new URL(page.url()).searchParams.get("thread")).toBe(thread);
  const draft=page.locator(".comms-composer textarea");await expect(draft).toBeVisible();
  await draft.fill("رسالة غير مرسلة — Unsaved message");
  await toggle(page,"ar");await expect(draft).toHaveValue("رسالة غير مرسلة — Unsaved message");
  await toggle(page,"de");await expect(draft).toHaveValue("رسالة غير مرسلة — Unsaved message");
  await expect(page.locator(".comms-message").filter({hasText:"QA Existing message"})).toBeVisible();
 }finally{await school.close();}
});

test("app settings do not reset unsaved staff permission edits",async({page,context})=>{
 test.setTimeout(90000);const school=schoolFixtures();
 try{
  await school.seed();await signIn(page,school,"admin");
  const accessPage=await context.newPage();
  try{
   await accessPage.goto("/de/staff/access");
   const people=accessPage.getByRole("combobox",{name:"Person auswählen"});
   const teacherEmail=fixtureEmail(school.run,"teacher");
   await expect(people.getByRole("option",{name:teacherEmail,exact:true})).toHaveCount(1,{timeout:30000});
   const grantsResponse=accessPage.waitForResponse(response=>/\/api\/v1\/staff\/[^/]+\/grants$/.test(new URL(response.url()).pathname)&&response.request().method()==="GET");
   await people.selectOption({label:teacherEmail});
   const grants=await grantsResponse;
   expect(grants.ok(),`Staff grants request returned ${grants.status()}`).toBeTruthy();
   const adminRole=accessPage.locator("fieldset").first().locator('input[type="checkbox"]').first();
   await expect(adminRole).toBeVisible({timeout:20000});
   await expect(adminRole).not.toBeChecked();
   await adminRole.check();
   await expect(adminRole).toBeChecked();
   await toggle(accessPage,"ar");await expect(adminRole).toBeChecked();
   await toggle(accessPage,"de");await expect(adminRole).toBeChecked();
   // No grant changes are submitted by this test.
  }finally{await accessPage.close();}
 }finally{await school.close();}
});
