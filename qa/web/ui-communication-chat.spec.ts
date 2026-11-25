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
      const sent=await fixtureApi(school,`/threads/${thread}/messages`,{token,persona,method:"POST",key:id,status:201,body:{clientMessageId:id,body}});
      if(persona==="guardian")await fixtureApi(school,`/threads/${thread}/messages/${sent.payload.data.id}/reaction`,{token:teacher,persona:"teacher",method:"PUT",body:{emoji:"👍"}});
    }
    await context.addCookies([{name:"madrasty-session",value:guardian,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
    await page.setViewportSize({width:390,height:844});
    await page.goto("/de/school/messages?thread="+thread);
    await expect(page.locator(".comms-message[data-own=true]").filter({hasText:"Hallo Schule"})).toBeVisible();
    await expect(page.locator(".comms-message[data-own=false]").filter({hasText:"Guten Tag"})).toBeVisible();
    await expect(page.locator(".comms-message-actions[open]")).toHaveCount(0);
    await expect(page.getByRole("button",{name:"👍 1",exact:true})).toBeVisible();
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
    await expect(page.locator(".comms-person-row")).toHaveCount(1);
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


test("a touch long press exposes message actions and copies the actual message text",async({page,context})=>{
  const school=schoolFixtures();
  try{
    await school.seed();
    const admin=await school.bearer("admin","admin");
    await setUpCalendar(school,admin);
    const guardian=await school.bearer("guardian-de","guardian");
    const contacts=(await fixtureApi(school,"/directory",{token:guardian,persona:"guardian"})).payload.data;
    const target=contacts.find((c:{displayName:string})=>c.displayName==="يوسف عبد الرحمن محمود").target;
    const thread=(await fixtureApi(school,"/threads",{token:guardian,persona:"guardian",method:"POST",key:randomUUID(),body:{target}})).payload.data.threadId;
    const body="Diese Nachricht soll kopiert werden.";
    const id=randomUUID();
    await fixtureApi(school,`/threads/${thread}/messages`,{token:guardian,persona:"guardian",method:"POST",key:id,status:201,body:{clientMessageId:id,body}});
    // The OS clipboard is outside browser automation's control. Observe the
    // real writeText invocation at that browser boundary, not a UI-only toast.
    await page.addInitScript(()=>{
      Object.defineProperty(navigator,"clipboard",{configurable:true,value:{
        writeText:async(value:string)=>{document.documentElement.dataset.qaCopied=value;},
      }});
    });
    await context.addCookies([{name:"madrasty-session",value:guardian,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
    await page.setViewportSize({width:390,height:844});
    await page.goto("/de/school/messages?thread="+thread);
    const bubble=page.locator(".comms-message[data-own=true]").filter({hasText:body});
    await expect(bubble).toBeVisible();
    const actions=bubble.locator(".comms-message-actions");
    await expect(actions).not.toHaveAttribute("open","");
    const message=bubble.getByText(body,{exact:true});
    await message.dispatchEvent("pointerdown",{pointerType:"touch",pointerId:1,isPrimary:true,button:0,clientX:200,clientY:200});
    await expect(actions).toHaveAttribute("open","");
    await message.dispatchEvent("pointerup",{pointerType:"touch",pointerId:1,isPrimary:true,button:0});
    await bubble.getByRole("button",{name:"Text kopieren"}).click();
    await expect(page.locator("html")).toHaveAttribute("data-qa-copied",body);
  }finally{await school.close();}
});


test("mobile chat composer keeps media actions collapsed until requested",async({page,context})=>{
  const school=schoolFixtures();
  try{
    await school.seed();
    const admin=await school.bearer("admin","admin");
    await setUpCalendar(school,admin);
    const guardian=await school.bearer("guardian-de","guardian");
    const contacts=(await fixtureApi(school,"/directory",{token:guardian,persona:"guardian"})).payload.data;
    const target=contacts.find((c:{displayName:string})=>c.displayName==="يوسف عبد الرحمن محمود").target;
    const thread=(await fixtureApi(school,"/threads",{token:guardian,persona:"guardian",method:"POST",key:randomUUID(),body:{target}})).payload.data.threadId;
    await context.addCookies([{name:"madrasty-session",value:guardian,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
    for(const scenario of [
      {locale:"de",width:390,attach:"Anhang hinzufügen",actions:["Foto auswählen","Foto aufnehmen","Audio aufnehmen"]},
      {locale:"ar",width:320,attach:"إضافة مرفق",actions:["اختيار صورة","تصوير","سجّل صوت"]},
    ] as const){
      await page.setViewportSize({width:scenario.width,height:844});
      await page.goto("/"+scenario.locale+"/school/messages?thread="+thread);
      const composer=page.locator(".comms-composer");
      const input=composer.locator("textarea");
      await expect(input).toBeVisible();
      await input.fill("QA unsent draft");
      const toggle=composer.getByRole("button",{name:scenario.attach});
      await expect(toggle).toHaveAttribute("aria-expanded","false");
      for(const action of scenario.actions)await expect(composer.getByRole("button",{name:action,exact:true})).toBeHidden();
      expect((await composer.boundingBox())!.height,"idle composer must leave room for chat messages").toBeLessThanOrEqual(180);
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded","true");
      for(const action of scenario.actions)await expect(composer.getByRole("button",{name:action,exact:true})).toBeVisible();
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded","false");
      await expect(input).toHaveValue("QA unsent draft");
      for(const action of scenario.actions)await expect(composer.getByRole("button",{name:action,exact:true})).toBeHidden();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
    }
  }finally{await school.close();}
});


test("saved news drafts reopen in management, publish and withdraw without leaking drafts to guardians",async({page,context})=>{
  const school=schoolFixtures();
  try{
    await school.seed();
    const admin=await school.bearer("admin","admin");
    await setUpCalendar(school,admin);
    const guardian=await school.bearer("guardian-de","guardian");
    await context.addCookies([{name:"madrasty-session",value:admin,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
    await page.setViewportSize({width:390,height:844});
    await page.goto("/de/school/messages?section=feed");
    await page.getByLabel("Veröffentlichen & verwalten").click();
    await page.getByRole("link",{name:"Neue Neuigkeit"}).click();
    const title="QA draft "+randomUUID().slice(0,8);
    await page.getByLabel("Zielgruppe").selectOption("school");
    await page.getByLabel("Titel",{exact:true}).fill(title);
    await page.getByLabel("Text",{exact:true}).fill("Nur synthetische Testdaten.");
    await page.getByRole("button",{name:"Vorschau",exact:true}).click();
    await page.getByRole("button",{name:"Speichern",exact:true}).click();
    await expect(page.getByRole("status").filter({hasText:"Änderung gespeichert."})).toBeVisible();
    const feed=async()=> (await fixtureApi(school,"/comms/feed?limit=25&locale=de&filter=news",{token:guardian,persona:"guardian"})).payload.data;
    expect((await feed()).some((item:{title:string})=>item.title===title)).toBe(false);
    await page.getByRole("button",{name:"Zurück",exact:true}).click();
    await expect(page.getByRole("button",{name:"Beiträge verwalten"})).toHaveAttribute("aria-pressed","true");
    const row=page.locator(".group-list > li").filter({hasText:title});
    await expect(row).toBeVisible();
    await row.getByRole("link",{name:"Details öffnen"}).click();
    await page.getByRole("button",{name:"Bearbeiten",exact:true}).click();
    await expect(page.getByLabel("Titel",{exact:true})).toHaveValue(title);
    await page.getByRole("button",{name:"Vorschau",exact:true}).click();
    await page.getByRole("button",{name:"Speichern",exact:true}).click();
    await page.getByRole("button",{name:"Veröffentlichen",exact:true}).click();
    await expect(page.getByRole("status").filter({hasText:"Veröffentlicht."})).toBeVisible();
    expect((await feed()).some((item:{title:string})=>item.title===title)).toBe(true);
    page.once("dialog",dialog=>dialog.accept());
    await page.getByRole("button",{name:"Zurückziehen",exact:true}).click();
    await expect(page.getByRole("status").filter({hasText:"Zurückgezogen."})).toBeVisible();
    expect((await feed()).some((item:{title:string})=>item.title===title)).toBe(false);
  }finally{await school.close();}
});

test("message retry preserves the client identifier and a remote reply arrives without reloading",async({page,context})=>{
  test.setTimeout(90000);
  const school=schoolFixtures();
  try{
    await school.seed();
    const admin=await school.bearer("admin","admin");
    await setUpCalendar(school,admin);
    const guardian=await school.bearer("guardian-de","guardian");
    const teacher=await school.bearer("teacher","teacher");
    const contacts=(await fixtureApi(school,"/directory",{token:guardian,persona:"guardian"})).payload.data;
    const target=contacts.find((c:{displayName:string})=>c.displayName==="يوسف عبد الرحمن محمود").target;
    const thread=(await fixtureApi(school,"/threads",{token:guardian,persona:"guardian",method:"POST",key:randomUUID(),body:{target}})).payload.data.threadId;
    await context.addCookies([{name:"madrasty-session",value:guardian,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
    await page.setViewportSize({width:390,height:844});
    await page.goto("/de/school/messages?thread="+thread);
    const body="Retry QA "+randomUUID().slice(0,8);
    const ids:string[]=[];
    await page.route("**/api/v1/threads/"+thread+"/messages",async route=>{
      if(route.request().method()!=="POST"){await route.continue();return;}
      const request=route.request().postDataJSON() as {clientMessageId:string};
      ids.push(request.clientMessageId);
      if(ids.length===1){await route.abort("failed");return;}
      await route.continue();
    });
    const composer=page.locator(".comms-composer");
    const input=composer.locator("textarea");
    await input.fill(body);
    await composer.getByRole("button",{name:"Senden",exact:true}).click();
    await expect(composer.getByRole("button",{name:"Erneut senden"})).toBeVisible();
    await expect(input).toHaveValue(body);
    await composer.getByRole("button",{name:"Erneut senden"}).click();
    await expect(page.locator(".comms-timeline .comms-message").filter({hasText:body})).toHaveCount(1);
    expect(ids).toHaveLength(2);
    expect(ids[1]).toBe(ids[0]);
    const actual=(await fixtureApi(school,"/threads/"+thread+"/messages",{token:teacher,persona:"teacher"})).payload.data;
    expect(actual.filter((item:{body:string})=>item.body===body)).toHaveLength(1);
    const reply="QA reply "+randomUUID().slice(0,8),id=randomUUID();
    await fixtureApi(school,"/threads/"+thread+"/messages",{token:teacher,persona:"teacher",method:"POST",key:id,status:201,body:{clientMessageId:id,body:reply}});
    await expect(page.locator(".comms-timeline .comms-message[data-own=false]").filter({hasText:reply})).toBeVisible({timeout:20000});
  }finally{await school.close();}
});


for(const scenario of [
  {actor:"admin",persona:"admin",locale:"de",width:390},
  {actor:"teacher",persona:"teacher",locale:"ar",width:320},
  {actor:"guardian-ar",persona:"guardian",locale:"ar",width:390},
  {actor:"admin",persona:"admin",locale:"ar",width:320},
  {actor:"teacher",persona:"teacher",locale:"de",width:390},
  {actor:"guardian-de",persona:"guardian",locale:"de",width:320},
] as const){
  test("communication mobile sections "+scenario.persona+" "+scenario.locale,async({page,context})=>{
    test.setTimeout(90000);
    const school=schoolFixtures();
    try{
      await school.seed();
      const admin=await school.bearer("admin","admin");
      await setUpCalendar(school,admin);
      const token=await school.bearer(scenario.actor,scenario.persona);
      await context.addCookies([{name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
      await page.setViewportSize({width:scenario.width,height:844});
      const ar=scenario.locale==="ar";
      for(const section of ["chat","feed","calendar"] as const){
        const endpoint=section==="chat"?"/api/v1/threads?":section==="feed"?"/api/v1/comms/feed?":"/api/v1/comms/calendar?";
        const read=page.waitForResponse(r=>r.url().includes(endpoint)&&r.request().method()==="GET",{timeout:25000});
        await page.goto("/"+scenario.locale+"/school/messages?section="+section);
        expect((await read).ok(),section+" data request must succeed").toBe(true);
        const content=page.locator(".comms-hub");
        const result=section==="chat"?".comms-thread-row, [data-async-state=empty]":section==="feed"?".comms-feed-card, [data-async-state=empty]":".school-month-grid";
        await expect(content.locator(result).first()).toBeVisible({timeout:25000});
        await expect(content.locator(".comms-hub-tabs a[aria-current=page]")).toHaveText(section==="chat"?(ar?"المحادثات":"Chats"):section==="feed"?(ar?"المستجدات":"Aktuelles"):(ar?"التقويم":"Kalender"));
        if(scenario.persona==="guardian"&&section==="feed")await expect(content.locator(".comms-publish-menu")).toHaveCount(0);
        expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
        mkdirSync("qa-artifacts/ui-after",{recursive:true});
        await page.screenshot({path:"qa-artifacts/ui-after/comms-"+scenario.persona+"-"+scenario.locale+"-"+scenario.width+"-"+section+".png",animations:"disabled"});
      }
    }finally{await school.close();}
  });
}
