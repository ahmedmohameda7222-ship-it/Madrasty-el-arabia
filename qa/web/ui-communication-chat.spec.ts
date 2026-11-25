import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { schoolFixtures } from "../fixtures/school";
import { setUpCalendar } from "../fixtures/calendar";
import { fixtureApi } from "../support/api";
import { localOrigin } from "../support/target";

test("direct chat presents sent and received bubbles and compact actions", async ({page,context})=>{
  const school=schoolFixtures();
  try {
    await school.seed();
    const admin=await school.bearer("admin","admin");
    await setUpCalendar(school,admin);
    const guardian=await school.bearer("guardian-de","guardian");
    const teacher=await school.bearer("teacher","teacher");
    const contacts=(await fixtureApi(school,"/directory",{token:guardian})).payload.data;
    const target=contacts.find((c:{displayName:string})=>c.displayName==="يوسف عبد الرحمن محمود").target;
    const thread=(await fixtureApi(school,"/threads",{token:guardian,persona:"guardian",method:"POST",key:randomUUID(),body:{target}})).payload.data.threadId;
    for(const [token,persona,body] of [[guardian,"guardian","Hallo Schule"],[teacher,"teacher","Guten Tag"]] as const){
      const id=randomUUID();
      await fixtureApi(school,`/threads/${thread}/messages`,{token,persona,method:"POST",key:id,status:201,body:{clientMessageId:id,body}});
    }
    await context.addCookies([{name:"madrasty-session",value:guardian,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
    await page.setViewportSize({width:390,height:844});
    await page.goto("/de/school/messages?thread="+thread);
    await expect(page.locator(".comms-message[data-own=true]").filter({hasText:"Hallo Schule"})).toBeVisible();
    await expect(page.locator(".comms-message[data-own=false]").filter({hasText:"Guten Tag"})).toBeVisible();
    await expect(page.locator(".comms-message-actions[open]")).toHaveCount(0);
    await expect(page.locator(".comms-composer textarea")).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
    mkdirSync("qa-artifacts/ui-after",{recursive:true});
    await page.screenshot({path:"qa-artifacts/ui-after/communication-chat-de-390.png",animations:"disabled"});
  }finally{await school.close();}
});

test("guardian contact picker exposes responsible teacher first, then the full searchable directory",async({page,context})=>{
  const school=schoolFixtures();
  try{
    await school.seed();
    const admin=await school.bearer("admin","admin");
    await setUpCalendar(school,admin);
    const guardian=await school.bearer("guardian-de","guardian");
    await context.addCookies([{name:"madrasty-session",value:guardian,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
    await page.setViewportSize({width:320,height:844});
    await page.goto("/de/school/messages");
    await page.getByRole("link",{name:"Neue Nachricht"}).click();
    await expect(page.getByRole("button",{name:"Meine Kontakte"})).toHaveAttribute("aria-pressed","true");
    await expect(page.locator(".comms-people-group h2").first()).toHaveText("Lehrkräfte meiner Kinder");
    await expect(page.locator(".comms-person-row").filter({hasText:"Johannes Peter Schneider"})).toHaveCount(0);
    await page.getByRole("button",{name:"Alle Personen"}).click();
    await page.getByRole("searchbox",{name:"Person suchen"}).fill("Johannes Peter Schneider");
    await expect(page.locator(".comms-person-row").filter({hasText:"Johannes Peter Schneider"})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
    mkdirSync("qa-artifacts/ui-after",{recursive:true});
    await page.screenshot({path:"qa-artifacts/ui-after/communication-directory-de-320.png",animations:"disabled"});
  }finally{await school.close();}
});


test("announcement draft survives changing tabs without selecting recipients automatically",async({page,context})=>{
  const school=schoolFixtures();
  try{
    await school.seed();
    const admin=await school.bearer("admin","admin");
    await setUpCalendar(school,admin);
    await context.addCookies([{name:"madrasty-session",value:admin,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
    await page.setViewportSize({width:390,height:844});
    await page.goto("/de/school/more/broadcasts");
    await expect(page.getByLabel("Zielgruppe")).toHaveValue("");
    await page.getByLabel("Titel",{exact:true}).fill("Unpublished QA draft");
    await page.getByRole("button",{name:"Empfangene Mitteilungen"}).click();
    await page.getByRole("button",{name:"Neue Mitteilung"}).click();
    await expect(page.getByLabel("Titel",{exact:true})).toHaveValue("Unpublished QA draft");
    await expect(page.getByRole("button",{name:"Vorschau erstellen"})).toBeDisabled();
  }finally{await school.close();}
});


test("calendar detail returns to the same month, day and class filter",async({page,context})=>{
  const school=schoolFixtures();
  try{
    await school.seed();
    const admin=await school.bearer("admin","admin");
    const {apple}=await setUpCalendar(school,admin);
    const guardian=await school.bearer("guardian-de","guardian");
    const day=new Date().toISOString().slice(0,10);
    const event=(await fixtureApi(school,"/events",{token:admin,persona:"admin",method:"POST",key:randomUUID(),body:{audience:{kind:"class",classId:apple.id},sourceLocale:"de",copy:{de:{title:"QA event for calendar return",body:"Test"}},timing:{start:{date:day,time:null},end:null,allDay:true}},status:[200,201]})).payload.data;
    await fixtureApi(school,"/events/"+event.id,{token:admin,persona:"admin",method:"PATCH",key:randomUUID(),body:{action:"publish",revision:event.revision}});
    await context.addCookies([{name:"madrasty-session",value:guardian,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
    await page.setViewportSize({width:390,height:844});
    const params=new URLSearchParams({section:"calendar",month:day.slice(0,7),day,classId:apple.id});
    await page.goto("/de/school/messages?"+params);
    await page.getByRole("link",{name:"Details öffnen"}).first().click();
    await expect(page.getByRole("heading",{name:"QA event for calendar return"})).toBeVisible();
    await page.getByRole("link",{name:"Zurück zu Kontakt"}).click();
    await expect(page).toHaveURL(/section=calendar/);
    const returned=new URL(page.url()).searchParams;
    assertContext(returned,"month",day.slice(0,7));
    assertContext(returned,"day",day);
    assertContext(returned,"classId",apple.id);
  }finally{await school.close();}
});
function assertContext(params:URLSearchParams,key:string,value:string){expect(params.get(key)).toBe(value);}
