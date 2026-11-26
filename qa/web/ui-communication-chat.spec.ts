import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { schoolFixtures, type FixtureSchool } from "../fixtures/school";
import { setUpCalendar } from "../fixtures/calendar";
import { fixtureApi } from "../support/api";
import { fixtureEmail, localOrigin } from "../support/target";

test("direct chat presents sent and received bubbles and compact actions", async ({page})=>{
  test.setTimeout(90000);
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
    await signInForWrite(page,school,"guardian-de");
    await page.setViewportSize({width:390,height:844});
    // Sign-in may still be finishing its client-side redirect. Use the actual
    // inbox navigation after the authenticated shell has rendered.
    await expect(page.locator(".school-content")).toBeVisible({timeout:20000});
    const inbox=page.locator('a[href="/de/school/messages"]').first();
    await expect(inbox).toBeVisible({timeout:20000});
    await inbox.click();
    await expect(page.getByRole("heading",{name:"Kontakt",exact:true})).toHaveCount(1);
    await expect(page.locator(".comms-inbox-heading h2")).toHaveCount(0);
    await expect(page.getByRole("link",{name:"Neue Nachricht",exact:true})).toBeVisible();
    await expect(page.getByRole("button",{name:"Suchen",exact:true})).toHaveCount(0);
    const row=page.locator(".comms-thread-row").filter({has:page.locator('small', {hasText:"Guten Tag"})});
    await expect(row).toBeVisible({timeout:20000});
    await row.click();
    await expect.poll(()=>new URL(page.url()).searchParams.get("thread")).toBe(thread);
    await expect(page.locator(".comms-message[data-own=true]").filter({hasText:"Hallo Schule"})).toBeVisible({timeout:20000});
    await expect(page.locator(".comms-message[data-own=false]").filter({hasText:"Guten Tag"})).toBeVisible();
    await expect(page.locator(".comms-day-divider")).toHaveCount(1);
    await expect(page.locator(".comms-message-actions[open]")).toHaveCount(0);
    await expect(page.getByRole("button",{name:"👍 1",exact:true})).toBeVisible();
    const footer=page.locator(".comms-message-footer").first();
    const layout=await footer.evaluate(el=>{const stamp=el.querySelector(".comms-message-time")!.getBoundingClientRect(),actions=el.querySelector("summary")!.getBoundingClientRect();return {gap:Math.abs(stamp.y+stamp.height/2-actions.y-actions.height/2),target:actions.height};});
    expect(layout.gap,"timestamp and actions share the same compact row").toBeLessThanOrEqual(8);
    expect(layout.target).toBeGreaterThanOrEqual(44);
    await expect(page.locator(".comms-composer textarea")).toBeVisible();
    await expect(page.locator(".school-nav")).toBeHidden();
    await expect(page.locator(".school-header").getByRole("button",{name:"App-Einstellungen"})).toBeVisible();
    const area=page.locator(".comms-message-area");
    const composer=page.locator(".comms-composer");
    expect((await area.boundingBox())!.height,"timeline uses remaining screen").toBeGreaterThan(460);
    for(const height of [844,480]){
      await page.setViewportSize({width:390,height});
      await expect.poll(async()=>{const a=await area.boundingBox(),c=await composer.boundingBox();return !!a&&!!c&&a.height>=80&&c.y+c.height<=height+1;}).toBe(true);
      expect(await page.locator(".school-content").evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(1);
    }
    await page.setViewportSize({width:390,height:844});
    await composer.locator("textarea").fill("QA gallery retains draft");
    await page.getByRole("button",{name:"Kontaktinformationen",exact:true}).click();
    const profile=page.getByRole("dialog",{name:"Kontaktinformationen"});
    await expect(profile.getByText("يوسف عبد الرحمن محمود",{exact:true})).toBeVisible();
    await profile.getByRole("button",{name:"Schließen",exact:true}).click();
    await expect(composer.locator("textarea")).toHaveValue("QA gallery retains draft");
    await page.locator(".comms-chat-options > summary").click();
    await page.getByRole("button",{name:"Geteilte Medien",exact:true}).click();
    const gallery=page.getByRole("dialog",{name:"Geteilte Medien"});
    await expect(gallery).toBeVisible();
    await expect(gallery.getByText("Keine geteilten Medien in dieser Unterhaltung.")).toBeVisible();
    await gallery.getByRole("button",{name:"Schließen",exact:true}).click();
    await expect(composer.locator("textarea")).toHaveValue("QA gallery retains draft");
    await composer.locator("textarea").fill("");
    await page.locator(".comms-chat-options > summary").click();
    await page.setViewportSize({width:1280,height:840});
    await expect(page.locator(".comms-split-sidebar")).toBeVisible();
    await expect(page.locator(".comms-split-sidebar .comms-thread-row[aria-current=page]")).toBeVisible();
    await expect(composer.locator("textarea")).toBeVisible();
    await page.setViewportSize({width:390,height:844});
    await expect(page.locator(".comms-split-sidebar")).toHaveCount(0);
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
    // Same-query foreground refresh must not replace the visible directory with a skeleton.
    // Hold only the real matching fetch at the page boundary. This also works
    // when a browser service worker makes Playwright network routes invisible.
    await page.bringToFront();
    await page.evaluate(()=>{
      const original=window.fetch;
      let release!:()=>void;
      const gate=new Promise<void>(resolve=>{release=resolve;});
      const state={started:false,restore:()=>{window.fetch=original;release();}};
      (window as typeof window & {__qaDirectoryRefresh?:typeof state}).__qaDirectoryRefresh=state;
      window.fetch=async(input,init)=>{
        const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url,location.origin);
        if(url.pathname==="/api/v1/directory"&&url.searchParams.get("view")==="all"&&url.searchParams.get("query")==="Johannes Peter Schneider"){
          state.started=true;await gate;
        }
        return original.call(window,input,init);
      };
      window.dispatchEvent(new Event("focus"));
    });
    try{
      await expect.poll(()=>page.evaluate(()=>(window as typeof window & {__qaDirectoryRefresh?:{started:boolean}}).__qaDirectoryRefresh?.started)).toBe(true);
      await expect(page.locator(".comms-person-row").filter({hasText:"Johannes Peter Schneider"})).toBeVisible({timeout:1500});
      await expect(page.locator(".comms-directory [data-async-state=loading]")).toHaveCount(0);
    }finally{await page.evaluate(()=>(window as typeof window & {__qaDirectoryRefresh?:{restore:()=>void}}).__qaDirectoryRefresh?.restore());}
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
    const params=new URLSearchParams({month:day.slice(0,7),day,classId:apple.id});
    await page.goto("/de/school/messages?section=calendar&"+params);
    await expect(page).toHaveURL(/\/school\/calendar\?/);
    await expect(page.locator(".school-nav [aria-current=page]")).toHaveText("Kalender");
    await page.getByRole("link",{name:"Details öffnen"}).first().click();
    await expect(page.getByRole("heading",{name:"QA event for calendar return"})).toBeVisible();
    // The detail and list share the same pathname. Wait for the list navigation
    // itself to finish, not merely a URL regex that already matches the detail.
    async function expectReturn(target:Page){
      await expect.poll(()=>new URL(target.url()).searchParams.has("item")).toBe(false);
      await expect(target.locator(".school-month-grid[data-calendar-ready=true]")).toBeVisible();
      await expect(target.getByRole("link",{name:"Zurück zum Kalender",exact:true})).toHaveCount(0);
      const returned=new URL(target.url());
      expect(returned.pathname).toBe("/de/school/calendar");
      for(const [key,value] of params)assertContext(returned.searchParams,key,value);
    }
    await page.getByRole("link",{name:"Zurück zum Kalender",exact:true}).click();
    await expectReturn(page);
    const legacy="/de/school/more/events?item="+event.id+"&"+params;
    const redirect=await page.request.get(legacy,{maxRedirects:0});
    expect(redirect.status()).toBe(307);
    const destination=new URL(redirect.headers().location!,localOrigin);
    expect(destination.pathname).toBe("/de/school/calendar");
    assertContext(destination.searchParams,"item",event.id);
    for(const [key,value] of params)assertContext(destination.searchParams,key,value);
    // Exercise a real external bookmark in an independent browser document,
    // so it cannot race with the preceding client-side calendar return.
    const bookmark=await context.newPage();
    try{
      await bookmark.setViewportSize({width:390,height:844});
      await bookmark.goto(legacy);
      await expect.poll(()=>new URL(bookmark.url()).searchParams.get("item")).toBe(event.id);
      await expect(bookmark).toHaveURL(/\/school\/calendar\?/);
      for(const [key,value] of params)assertContext(new URL(bookmark.url()).searchParams,key,value);
      await expect(bookmark.getByRole("heading",{name:"QA event for calendar return"})).toBeVisible();
      await bookmark.getByRole("link",{name:"Zurück zum Kalender",exact:true}).click();
      await expectReturn(bookmark);
    }finally{await bookmark.close();}
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
      {locale:"de",width:390,attach:"Anhang hinzufügen",voice:"Sprachnachricht aufnehmen",send:"Senden",permission:"Erlaube den Zugriff auf das Mikrofon",actions:["Foto auswählen","Foto aufnehmen","Audio aufnehmen"]},
      {locale:"ar",width:320,attach:"إضافة مرفق",voice:"تسجيل رسالة صوتية",send:"إرسال",permission:"اسمح بالميكروفون",actions:["اختيار صورة","تصوير","سجّل صوت"]},
    ] as const){
      await page.setViewportSize({width:scenario.width,height:844});
      await page.goto("/"+scenario.locale+"/school/messages?thread="+thread);
      const composer=page.locator(".comms-composer");
      const input=composer.locator("textarea");
      await expect(input).toBeVisible();
      const mic=composer.getByRole("button",{name:scenario.voice,exact:true});
      const send=composer.getByRole("button",{name:scenario.send,exact:true});
      await expect(mic).toBeEnabled();
      await expect(send).toHaveCount(0);
      // Exercise the real record entry point without accessing a physical microphone.
      await page.evaluate(()=>{
        Object.defineProperty(navigator.mediaDevices,"getUserMedia",{configurable:true,value:async()=>{
          document.documentElement.dataset.qaMicrophone="requested";
          throw new DOMException("QA permission denied","NotAllowedError");
        }});
      });
      await mic.click();
      await expect(page.locator("html")).toHaveAttribute("data-qa-microphone","requested");
      await expect(composer.getByRole("alert")).toContainText(scenario.permission);
      await expect(mic).toBeEnabled();
      await input.fill("QA unsent draft");
      await expect(send).toBeEnabled();
      await expect(mic).toHaveCount(0);
      await input.fill("   ");
      await expect(mic).toBeEnabled();
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


// Exercise the same sign-in and administrator verification flow as actual users.
async function signInForWrite(page:Page,school:FixtureSchool,principal:"admin"|"guardian-de"){
  await page.goto("/de/account/sign-in");
  await page.locator('input[name="email"]').fill(fixtureEmail(school.run,principal));
  await page.locator('input[name="password"]').fill(school.password);
  await page.getByRole("button",{name:"Anmelden",exact:true}).click();
  if(principal==="admin"){
    await expect(page).toHaveURL(/\/de\/account\/security$/, {timeout:20000});
    const enrolled=await school.localMfa("admin");
    await page.locator('input[name="code"]').fill(enrolled.code());
    await page.getByRole("button",{name:"Bestätigen",exact:true}).click();
  }
  await expect(page).toHaveURL(/\/de\/school\/home(?:\?.*)?$/, {timeout:20000});
}

test("saved news drafts reopen in management, publish and withdraw without leaking drafts to guardians",async({page})=>{
  test.setTimeout(90000);
  const school=schoolFixtures();
  try{
    await school.seed();
    const admin=await school.bearer("admin","admin");
    await setUpCalendar(school,admin);
    const guardian=await school.bearer("guardian-de","guardian");
    await signInForWrite(page,school,"admin");
    await page.setViewportSize({width:390,height:844});
    await page.goto("/de/school/messages?section=feed");
    await page.getByLabel("Veröffentlichen & verwalten").click();
    await page.getByRole("link",{name:"Neue Neuigkeit"}).click();
    const title="QA draft "+randomUUID().slice(0,8);
    await page.getByLabel("Zielgruppe").selectOption("school");
    await page.getByLabel("Titel",{exact:true}).fill(title);
    await page.getByLabel("Text",{exact:true}).fill("Nur synthetische Testdaten.");
    await page.getByRole("button",{name:"Vorschau",exact:true}).click();
    const saveResponse=page.waitForResponse(r=>r.url().endsWith("/api/v1/news")&&r.request().method()==="POST");
    await page.getByRole("button",{name:"Speichern",exact:true}).click();
    expect((await saveResponse).status(),"draft creation must succeed").toBe(201);
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

test("message retry preserves the client identifier and a remote reply arrives without reloading",async({page})=>{
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
    await signInForWrite(page,school,"guardian-de");
    await page.setViewportSize({width:390,height:844});
    // Simulate one lost connection at the actual browser fetch boundary.
    // The app's installed Service Worker can hide requests from Playwright routing.
    // Only this local synthetic message endpoint is affected; the retry uses
    // the real fetch implementation, application authentication and database.
    await page.addInitScript(({path})=>{
      const original=window.fetch.bind(window);
      const ids:string[]=[];
      Object.defineProperty(window,"__qaMessageAttempts",{value:ids});
      window.fetch=(input,init)=>{
        const url=new URL(input instanceof Request?input.url:String(input),location.origin);
        const method=init?.method??(input instanceof Request?input.method:"GET");
        if(url.origin===location.origin&&url.pathname===path&&method.toUpperCase()==="POST"&&typeof init?.body==="string"){
          const message=JSON.parse(init.body) as {clientMessageId:string};
          ids.push(message.clientMessageId);
          if(ids.length===1)return Promise.reject(new TypeError("Synthetic QA connection interruption"));
        }
        return original(input,init);
      };
    },{path:"/api/v1/threads/"+thread+"/messages"});
    await page.goto("/de/school/messages?thread="+thread);
    const body="Retry QA "+randomUUID().slice(0,8);
    const attempts=()=>page.evaluate(()=>(window as Window&{__qaMessageAttempts:string[]}).__qaMessageAttempts);
    const composer=page.locator(".comms-composer");
    const input=composer.locator("textarea");
    await input.fill(body);
    await composer.getByRole("button",{name:"Senden",exact:true}).click();
    await expect.poll(async()=>(await attempts()).length,{message:"browser send reached the failure simulation"}).toBe(1);
    await expect(composer.getByRole("button",{name:"Erneut senden"})).toBeVisible();
    await expect(input).toHaveValue(body);
    const before=(await fixtureApi(school,"/threads/"+thread+"/messages",{token:teacher,persona:"teacher"})).payload.data;
    expect(before.filter((item:{body:string})=>item.body===body)).toHaveLength(0);
    await composer.getByRole("button",{name:"Erneut senden"}).click();
    await expect(page.locator(".comms-timeline .comms-message").filter({hasText:body})).toHaveCount(1);
    const ids=await attempts();
    expect(ids).toHaveLength(2);
    expect(ids[1]).toBe(ids[0]);
    const actual=(await fixtureApi(school,"/threads/"+thread+"/messages",{token:teacher,persona:"teacher"})).payload.data;
    expect(actual.filter((item:{body:string})=>item.body===body)).toHaveLength(1);
    const reply="QA reply "+randomUUID().slice(0,8),id=randomUUID();
    await fixtureApi(school,"/threads/"+thread+"/messages",{token:teacher,persona:"teacher",method:"POST",key:id,status:201,body:{clientMessageId:id,body:reply}});
    // Simulate the opaque, verified service-worker refresh hint; the response is still the actual scoped API.
    const wake=page.waitForResponse(response=>response.url().includes("/api/v1/threads/"+thread+"/messages?")&&response.request().method()==="GET");
    await page.evaluate(()=>window.dispatchEvent(new Event("madrasty-communication-wake")));
    expect((await wake).ok()).toBe(true);
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
        await page.goto("/"+scenario.locale+"/school/"+(section==="calendar"?"calendar":"messages?section="+section));
        expect((await read).ok(),section+" data request must succeed").toBe(true);
        const content=page.locator(section==="calendar"?".school-content":".comms-hub");
        const result=section==="chat"?".comms-thread-row, [data-async-state=empty]":section==="feed"?".comms-feed-card, [data-async-state=empty]":".school-month-grid";
        await expect(content.locator(result).first()).toBeVisible({timeout:25000});
        if(section==="calendar"){
          await expect(page.locator(".school-nav [aria-current=page]")).toHaveText(ar?"التقويم":"Kalender");
          await expect(page.locator(".comms-hub-tabs")).toHaveCount(0);
        }else{
          await expect(content.locator(".comms-hub-tabs a")).toHaveCount(2);
          await expect(content.locator(".comms-hub-tabs a[aria-current=page]")).toHaveText(section==="chat"?(ar?"المحادثات":"Chats"):(ar?"المستجدات":"Aktuelles"));
          await expect(page.locator(".school-nav").getByRole("link",{name:ar?"التقويم":"Kalender",exact:true})).toBeVisible();
        }
        if(scenario.persona==="guardian"&&section==="feed")await expect(content.locator(".comms-publish-menu")).toHaveCount(0);
        expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
        mkdirSync("qa-artifacts/ui-after",{recursive:true});
        await page.screenshot({path:"qa-artifacts/ui-after/comms-"+scenario.persona+"-"+scenario.locale+"-"+scenario.width+"-"+section+".png",animations:"disabled"});
      }
    }finally{await school.close();}
  });
}


test("first-contact attachment preserves typed text and opens the actual composer",async({page})=>{
  test.setTimeout(90000);
  const school=schoolFixtures();
  try{
    await school.seed();
    const admin=await school.bearer("admin","admin");await setUpCalendar(school,admin);
    const guardian=await school.bearer("guardian-de","guardian");
    // The synthetic run is shared across this suite. Select an actually unused person
    // instead of the teacher whom earlier tests have already messaged.
    const rows=(await fixtureApi(school,"/directory?view=all&limit=100",{token:guardian,persona:"guardian"})).payload.data as {id:string;displayName:string;target:{kind:string}}[];
    let target:typeof rows[number]|undefined;
    for(const row of rows.filter(row=>row.target.kind==="person"&&row.displayName)){
      const detail=(await fixtureApi(school,"/directory/"+row.id,{token:guardian,persona:"guardian"})).payload.data;
      if(!detail.directThreadId){target=row;break;}
    }
    expect(target,"fixture must include an unmessaged person").toBeTruthy();
    if(!target)throw Error("No unused contact in synthetic directory");
    await signInForWrite(page,school,"guardian-de");
    await page.setViewportSize({width:390,height:844});
    await page.locator('.school-nav a[href*="/school/messages"]').click();
    await page.getByRole("link",{name:"Neue Nachricht",exact:true}).click();
    await expect(page.locator(".comms-person-row").first()).toBeVisible({timeout:20000});
    const all=page.getByRole("button",{name:"Alle Personen",exact:true});
    await all.click();
    await expect(all).toHaveAttribute("aria-pressed","true");
    const search=page.getByRole("searchbox",{name:"Person suchen"});
    const searched=page.waitForResponse(r=>{const url=new URL(r.url());return url.pathname==="/api/v1/directory"&&url.searchParams.get("view")==="all"&&url.searchParams.get("query")===target!.displayName&&r.request().method()==="GET";});
    await search.fill(target.displayName);
    await expect(search).toHaveValue(target.displayName);
    expect((await searched).ok()).toBe(true);
    const row=page.locator(".comms-person-row").filter({hasText:target.displayName});
    await expect(row).toHaveCount(1);
    await row.click();
    await expect(page.locator(".comms-first-contact")).toBeVisible();
    const firstComposer=page.locator(".comms-directory[data-compose=true] .comms-composer");
    await expect(page.locator(".school-nav")).toBeHidden();
    await expect(page.locator(".school-header").getByRole("button",{name:"App-Einstellungen"})).toBeVisible();
    await expect(page.getByRole("button",{name:"Zurück zu Personen",exact:true})).toBeVisible();
    for(const height of [844,480]){
      await page.setViewportSize({width:390,height});
      await expect.poll(async()=>{const c=await firstComposer.boundingBox();return !!c&&c.y+c.height>=height-16&&c.y+c.height<=height+1;}).toBe(true);
      expect(await page.locator(".school-content").evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(1);
    }
    await page.setViewportSize({width:390,height:844});
    const body="QA first message with attachment";
    const firstMic=page.getByRole("button",{name:"Sprachnachricht aufnehmen",exact:true});
    await expect(firstMic).toBeEnabled();
    await expect(page.getByRole("button",{name:"Senden",exact:true})).toHaveCount(0);
    await page.locator(".comms-composer textarea").fill(body);
    await expect(firstMic).toHaveCount(0);
    await expect(page.getByRole("button",{name:"Senden",exact:true})).toBeEnabled();
    await page.getByRole("button",{name:"Anhang hinzufügen",exact:true}).click();
    await expect.poll(()=>new URL(page.url()).searchParams.get("thread")).not.toBeNull();
    await expect(page.locator(".comms-conversation textarea")).toHaveValue(body);
    await expect(page.getByRole("button",{name:"Foto auswählen",exact:true})).toBeVisible();
    const thread=new URL(page.url()).searchParams.get("thread")!;
    expect((await fixtureApi(school,"/threads/"+thread+"/messages",{token:guardian,persona:"guardian"})).payload.data).toHaveLength(0);
    expect(await page.evaluate(text=>JSON.stringify(localStorage).includes(text)||JSON.stringify(sessionStorage).includes(text),body)).toBe(false);
  }finally{await school.close();}
});

test("unsent chat text survives leaving and returning to the thread in the same document",async({page,context})=>{
  const school=schoolFixtures();
  try{
    await school.seed();const admin=await school.bearer("admin","admin");await setUpCalendar(school,admin);
    const guardian=await school.bearer("guardian-de","guardian");
    const contacts=(await fixtureApi(school,"/directory",{token:guardian})).payload.data;
    const target=contacts.find((c:{displayName:string})=>c.displayName==="يوسف عبد الرحمن محمود").target;
    const thread=(await fixtureApi(school,"/threads",{token:guardian,persona:"guardian",method:"POST",key:randomUUID(),body:{target}})).payload.data.threadId;
    const id=randomUUID();await fixtureApi(school,"/threads/"+thread+"/messages",{token:guardian,persona:"guardian",method:"POST",key:id,status:201,body:{clientMessageId:id,body:"QA previous message"}});
    await context.addCookies([{name:"madrasty-session",value:guardian,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
    await page.setViewportSize({width:390,height:844});await page.goto("/de/school/messages?thread="+thread);
    const body="QA private unsent message";
    await page.locator(".comms-conversation textarea").fill(body);
    await page.getByRole("link",{name:"Zurück zu den Unterhaltungen"}).click();
    await page.locator('.comms-thread-row[href*="'+thread+'"]').click();
    await expect(page.locator(".comms-conversation textarea")).toHaveValue(body);
  }finally{await school.close();}
});
