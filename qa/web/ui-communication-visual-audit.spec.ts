import {randomUUID} from "node:crypto";
import {mkdirSync,writeFileSync} from "node:fs";
import {expect,test,type Page} from "@playwright/test";
import {schoolFixtures,type FixtureSchool} from "../fixtures/school";
import {setUpCalendar} from "../fixtures/calendar";
import {fixtureApi} from "../support/api";
import {fixtureEmail} from "../support/target";

const out="qa-artifacts/comms-visual-audit";
const cases=[
  {principal:"admin",persona:"admin",locale:"ar"},
  {principal:"admin",persona:"admin",locale:"de"},
  {principal:"teacher",persona:"teacher",locale:"ar"},
  {principal:"teacher",persona:"teacher",locale:"de"},
  {principal:"guardian-ar",persona:"guardian",locale:"ar"},
  {principal:"guardian-de",persona:"guardian",locale:"de"},
] as const;
type Scenario=typeof cases[number];
async function login(page:Page,school:FixtureSchool,scenario:Scenario){
  await page.goto("/de/account/sign-in");
  await page.locator('input[name="email"]').fill(fixtureEmail(school.run,scenario.principal));
  await page.locator('input[name="password"]').fill(school.password);
  await page.getByRole("button",{name:"Anmelden",exact:true}).click();
  if(scenario.persona==="admin"){
    await expect(page).toHaveURL(/\/de\/account\/security$/,{timeout:20000});
    const enrolled=await school.localMfa("admin");
    await page.locator('input[name="code"]').fill(enrolled.code());
    await page.getByRole("button",{name:"Bestätigen",exact:true}).click();
  }
  await expect(page).toHaveURL(/\/(ar|de)\/school\/home(?:\?.*)?$/,{timeout:20000});
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator(".school-content")).toBeVisible();
}
const title={ar:"لقاء أولياء الأمور والاستعدادات للأنشطة المدرسية",de:"Elternabend und Vorbereitung der Schulveranstaltungen"};
const body={ar:"يرجى مراجعة الموعد وإحضار المستندات المطلوبة. هذه بيانات اختبار فقط.",de:"Bitte beachten Sie den Termin und bringen Sie die notwendigen Unterlagen mit. Dies sind ausschließlich synthetische Testdaten."};
const copies={ar:{title:title.ar,body:body.ar},de:{title:title.de,body:body.de}};
const longChat="اختبار رسالة عربية وألمانية – Elternabend am Samstag, bitte die Unterlagen für die Schulveranstaltung mitbringen.";
type Contact={id:string;displayName:string|null;target:{kind:string;id:string};role:string};
async function capture(page:Page,prefix:string,state:string,issues:string[],files:string[]){
  await page.evaluate(()=>document.fonts.ready);
  const main=page.locator(".school-content");
  await expect(main).toBeVisible();
  const startScroll=await main.evaluate(el=>el.scrollTop);
  const path=out+"/"+prefix+"-"+state;
  const options={animations:"disabled",style:"nextjs-portal{display:none!important}"} as const;
  if(startScroll>24){await page.screenshot({...options,path:path+"-focus.png"});files.push(path+"-focus.png");}
  await main.evaluate(el=>el.scrollTop=0);
  // Inspect actual glyph ranges, rather than only checking document width.
  const found=await page.evaluate(()=>{
    const main=document.querySelector(".school-content")!;
    const problems:string[]=[];
    const frame=main.getBoundingClientRect();
    if(main.scrollWidth>main.clientWidth+2)problems.push("scrolling content overflows horizontally");
    if(document.documentElement.scrollWidth>innerWidth+2)problems.push("document overflows horizontally");
    const isRendered=(e:Element)=>{const hidden=e.closest("details:not([open])");if(hidden&&!hidden.querySelector(":scope > summary")?.contains(e))return false;const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=="hidden";};
    const splitLines=(rects:DOMRect[])=>rects.some(a=>rects.some(b=>Math.abs((a.top+a.bottom-b.top-b.bottom)/2)>Math.min(a.height,b.height)*.65));
    const selectors=".comms-weekday,.comms-feed-filters button,.comms-hub-tabs a,.comms-calendar-actions button,.comms-person-row,.comms-thread-toolbar,.comms-input-bar,.comms-publish-menu-items,.comms-attachment-menu";
    for(const e of main.querySelectorAll(selectors)){
      const r=e.getBoundingClientRect();
      if(!isRendered(e))continue;
      if(r.left<frame.left-2||r.right>frame.right+2)problems.push(e.className+" outside content");
      if(e.matches(".comms-weekday,.comms-feed-filters button,.comms-hub-tabs a")){
        const range=document.createRange();range.selectNodeContents(e);
        const rects=Array.from(range.getClientRects()).filter(x=>x.width>0&&x.height>0);
        if(rects.some(x=>x.left<r.left-1||x.right>r.right+1||x.top<r.top-1||x.bottom>r.bottom+1))problems.push("clipped label: "+e.textContent);
        if(splitLines(rects))problems.push("broken single-line label: "+e.textContent);
      }
      if(e.matches(".comms-person-row")){
        for(const child of e.children){const c=child.getBoundingClientRect();if(c.width&&(c.left<r.left-1||c.right>r.right+1))problems.push("contact row child outside row");}
      }
    }
    for(const e of main.querySelectorAll("button:not(.comms-person-row),a.plain-button,summary,.comms-publications>h1,.comms-broadcast-screen>h1,.comms-notifications>h1")){
      const bounds=e.getBoundingClientRect();if(!isRendered(e))continue;
      const walker=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);
      while(walker.nextNode()){
        const node=walker.currentNode;const value=node.textContent??"";
        for(const word of value.matchAll(/[^\s]+/gu)){
          if(word[0].length<3)continue;
          const range=document.createRange();range.setStart(node,word.index!);range.setEnd(node,word.index!+word[0].length);
          const rects=Array.from(range.getClientRects()).filter(r=>r.width&&r.height);
          if(rects.some(r=>r.left<bounds.left-2||r.right>bounds.right+2))problems.push("word outside control: "+word[0]);
          if(splitLines(rects))problems.push("broken word: "+word[0]);
        }
      }
    }
    for(const e of main.querySelectorAll(".comms-message-area,.comms-message,.comms-composer,.comms-calendar,.comms-directory,.comms-broadcast-screen,.comms-notifications,.comms-publications"))if(isRendered(e)&&e.scrollWidth>e.clientWidth+3)problems.push("internal horizontal overflow: "+e.className);
    const days=main.querySelectorAll(".school-month-grid>button");
    for(const day of days){const r=day.getBoundingClientRect();if(r.height<43||r.width<28)problems.push("calendar day target too small");}
    return [...new Set(problems)];
  });
  issues.push(...found.map(problem=>prefix+" "+state+": "+problem));
  await page.screenshot({...options,path:path+".png"});files.push(path+".png");
  if(/^(04|06|07)/.test(state)){
    const inner=main.locator(".comms-message-area");if(await inner.count()){
      const pos=await inner.evaluate(el=>({start:el.scrollTop,max:el.scrollHeight-el.clientHeight,height:el.clientHeight}));
      if(pos.max>24){for(const y of [...new Set([0,Math.max(0,Math.min(pos.max,pos.height-40)),pos.max])]){
        await inner.evaluate((el,value)=>el.scrollTop=value,y);
        const name=path+"-thread-"+Math.round(y)+".png";await page.screenshot({...options,path:name});files.push(name);
      }await inner.evaluate((el,value)=>el.scrollTop=value,pos.start);}
    }
  }
  const scroll=await main.evaluate(el=>({max:Math.max(0,el.scrollHeight-el.clientHeight),view:el.clientHeight}));
  for(let y=scroll.view-100,i=1;y<scroll.max-20&&i<=5;y+=Math.max(200,scroll.view-100),i++){
    await main.evaluate((el,value)=>el.scrollTop=value,y);
    await page.screenshot({...options,path:path+"-scroll-"+i+".png"});files.push(path+"-scroll-"+i+".png");
  }
  if(scroll.max>24){
    await main.evaluate(el=>el.scrollTop=el.scrollHeight);
    await page.screenshot({...options,path:path+"-bottom.png"});files.push(path+"-bottom.png");
  }
  await main.evaluate(el=>el.scrollTop=0);
}

for(const scenario of cases){
  test("communication populated visual audit "+scenario.persona+" "+scenario.locale,async({page})=>{
    test.setTimeout(600000);
    page.setDefaultTimeout(15000);
    const school=schoolFixtures(),issues:string[]=[],files:string[]=[],notes:string[]=[];
    mkdirSync(out,{recursive:true});
    const key=scenario.persona+"-"+scenario.locale;
    try{
      await school.seed();
      const admin=await school.bearer("admin","admin");
      const {apple,year}=await setUpCalendar(school,admin);
      const actor=scenario.persona==="admin"?admin:await school.bearer(scenario.principal,scenario.persona);
      const counterpart=scenario.persona==="teacher"?await school.bearer("guardian-de","guardian"):await school.bearer("teacher","teacher");
      const otherRole=scenario.persona==="teacher"?"guardian":"teacher";
      const targetName=scenario.persona==="teacher"?"Johanna Marie Sophie von Hohenlohe-Langenburg-Wiśniewska-Kowalczyk":"يوسف عبد الرحمن محمود";
      const people:Contact[]=(await fixtureApi(school,"/directory?view=all&limit=100",{token:actor,persona:scenario.persona})).payload.data;
      const target=people.find(p=>p.displayName===targetName);
      expect(target,"counterparty exists in real directory").toBeTruthy();
      const thread=(await fixtureApi(school,"/threads",{token:actor,persona:scenario.persona,method:"POST",key:randomUUID(),body:{target:target!.target}})).payload.data.threadId;
      const send=async(token:string,persona:"admin"|"teacher"|"guardian",text:string)=>{
        const id=randomUUID();return (await fixtureApi(school,"/threads/"+thread+"/messages",{token,persona,method:"POST",key:id,status:201,body:{clientMessageId:id,body:text}})).payload.data;
      };
      const own=await send(actor,scenario.persona,longChat);
      const incoming=await send(counterpart,otherRole,"Guten Tag! أهلاً بحضرتك. Vielen Dank für die Information.");
      await fixtureApi(school,"/threads/"+thread+"/messages/"+own.id+"/reaction",{token:counterpart,persona:otherRole,method:"PUT",body:{emoji:"👍"}});
      const options=(await fixtureApi(school,"/school/publishing-options",{token:actor,persona:scenario.persona})).payload.data;
      const day=options.schoolDate as string,month=day.slice(0,7);
      const publish=async(path:"/news"|"/events",extra:object)=>{
        const item=(await fixtureApi(school,path,{token:admin,persona:"admin",method:"POST",key:randomUUID(),status:[200,201],body:{audience:{kind:"school"},sourceLocale:"de",copy:copies,...extra}})).payload.data;
        await fixtureApi(school,path+"/"+item.id,{token:admin,persona:"admin",method:"PATCH",key:randomUUID(),body:{action:"publish",revision:item.revision}});
        return item.id as string;
      };
      const news=await publish("/news",{});
      if(scenario.persona==="teacher")await fixtureApi(school,"/news",{token:actor,persona:"teacher",method:"POST",key:randomUUID(),status:[200,201],body:{audience:{kind:"class",classId:apple.id},sourceLocale:"de",copy:copies}});
      const event=await publish("/events",{timing:{start:{date:day,time:null},end:null,allDay:true}});
      const nextMonthDate=new Date(month+"-01T12:00:00Z");nextMonthDate.setUTCMonth(nextMonthDate.getUTCMonth()+1);
      const nextMonth=nextMonthDate.toISOString().slice(0,7);
      await fixtureApi(school,"/school/years/"+year.id+"/days/"+nextMonth+"-20",{token:admin,persona:"admin",method:"PUT",key:randomUUID(),body:{classId:apple.id,teaching:false,reason:"QA holiday",revision:0},status:[200,201]});
      const announcementCopy={ar:{title:"تنبيه مهم لأولياء الأمور",body:body.ar},de:{title:"Wichtige Mitteilung der Schulverwaltung",body:body.de}};
      const audience=scenario.persona==="teacher"?{kind:"all_teachers"}:{kind:"class_guardians",classId:apple.id};
      const preview=(await fixtureApi(school,"/broadcasts/preview",{token:admin,persona:"admin",method:"POST",status:201,body:{audience,copy:announcementCopy}})).payload.data;
      const broadcast=(await fixtureApi(school,"/broadcasts",{token:admin,persona:"admin",method:"POST",status:201,key:randomUUID(),body:{previewId:preview.previewId}})).payload.data.publicationId;
      // Local-only notification projection uses the same synthetic dispatch fixture as domain QA.
      const dispatch=process.env.SCHOOL_WORKER_SECRET;
      if(dispatch){for(let i=0;i<8;i++){
        const notices=(await fixtureApi(school,"/notifications?limit=25",{token:actor,persona:scenario.persona})).payload.data;
        if(notices.length)break;
        await fixtureApi(school,"/internal/dispatch",{method:"POST",token:dispatch});
      }}
      const reportAccess=scenario.persona==="admin"?(await fixtureApi(school,"/message-reports/access",{token:admin,persona:"admin"})).payload.data.allowed:false;
      if(scenario.persona==="admin"&&!reportAccess)notes.push("Moderator queue not granted to this fixture; no permission changes made.");
      await login(page,school,scenario);
      const ar=scenario.locale==="ar",base="/"+scenario.locale,hub=base+"/school/messages";
      const words={all:ar?"كل الأشخاص":"Alle Personen",search:ar?"ابحث عن شخص":"Person suchen",unread:ar?"غير مقروءة":"Ungelesen",archive:ar?"المؤرشفة":"Archiviert",newEvent:ar?"حدث جديد":"Neue Veranstaltung",report:ar?"الإبلاغ عن الرسالة":"Nachricht melden",title:ar?"العنوان":"Titel",body:ar?"النص":"Text"};
      for(const width of [320,390,430]){
        await page.setViewportSize({width,height:844});
        await page.emulateMedia({colorScheme:width===390?"dark":"light",reducedMotion:"reduce"});
        const prefix=key+"-"+width+(width===390?"-dark":"-light");
        const shot=(name:string)=>capture(page,prefix,name,issues,files);
        const open=async(path:string,selector:string)=>{
          const expected=new URL(path,page.url());
          for(let attempt=0;;attempt++){
            try{await page.goto(path,{waitUntil:"domcontentloaded"});break;}
            catch(error){if(attempt>=3||!/interrupted by another navigation/i.test(String(error)))throw error;await page.waitForLoadState("domcontentloaded").catch(()=>undefined);}
          }
          await expect.poll(()=>{const current=new URL(page.url());return current.pathname===expected.pathname&&[...expected.searchParams].every(([k,v])=>current.searchParams.get(k)===v);}).toBe(true);
          await expect(page.locator(selector).first()).toBeVisible({timeout:25000});
        };
        const section=async(name:string,run:()=>Promise<void>)=>{
          try{await run();}catch(error){issues.push(prefix+" "+name+": "+String(error).slice(0,1600));await shot(name+"-failed").catch(()=>undefined);}
        };
        await section("chat",async()=>{
        await send(counterpart,otherRole,"Neue Nachricht · رسالة جديدة "+width);
        await open(hub,".comms-thread-row");
        await shot("01-inbox-populated");
        await page.getByRole("button",{name:words.unread,exact:true}).click();
        await expect(page.locator(".inbox-filter-strip button[aria-pressed=true]")).toHaveText(words.unread);
        await page.locator(".school-content [data-async-state=empty],.comms-thread-row").first().waitFor({state:"visible"});
        await shot("02-inbox-unread");
        await page.getByRole("button",{name:words.archive,exact:true}).click();
        await expect(page.locator(".inbox-filter-strip button[aria-pressed=true]")).toHaveText(words.archive);
        await page.locator(".school-content [data-async-state=empty],.comms-thread-row").first().waitFor({state:"visible"});
        await shot("03-inbox-archive");
        await open(hub+"?thread="+thread,".comms-message[data-own=false]");
        await shot("04-chat");
        await page.locator(".comms-chat-options>summary").click();
        await shot("05-chat-search-and-archive");
        await page.locator(".comms-chat-options>summary").click();
        await page.locator(".comms-message[data-own=false] .comms-message-actions>summary").first().click();
        await shot("06-message-actions");
        const actionDetails=page.locator(".comms-message[data-own=false] .comms-message-actions").first();
        await actionDetails.locator("details>summary").click();
        await shot("06a-reaction-picker");
        await actionDetails.locator("details>summary").click();
        await actionDetails.getByRole("button",{name:ar?"رد":"Antworten",exact:true}).click();
        await expect(page.getByRole("button",{name:ar?"إلغاء الرد":"Antwort verwerfen",exact:true})).toBeVisible();
        await shot("06b-reply-draft");
        await page.getByRole("button",{name:ar?"إلغاء الرد":"Antwort verwerfen",exact:true}).click();
        const report=page.getByRole("button",{name:words.report,exact:true}).first();
        await report.click();
        await expect(page.locator(".comms-report-form textarea")).toBeInViewport();
        await shot("07-report-form");
        await page.getByRole("button",{name:ar?"إلغاء":"Abbrechen",exact:true}).first().click();
        await page.locator(".comms-message[data-own=false] .comms-message-actions>summary").first().click();
        await page.locator(".comms-composer textarea").fill(longChat);
        await page.locator(".comms-attach-button").click();
        await expect(page.locator(".comms-attachment-menu")).toBeVisible();
        await shot("08-attachment-menu");
        await page.locator(".comms-attach-button").click();
        await shot("09-composer-draft");
        const sample=await page.evaluate(()=>{const c=document.createElement("canvas");c.width=320;c.height=180;const g=c.getContext("2d")!;g.fillStyle="#dce6e4";g.fillRect(0,0,320,180);g.fillStyle="#08756b";g.fillRect(16,16,288,148);g.fillStyle="white";g.font="24px sans-serif";g.fillText("QA photo",95,100);return c.toDataURL("image/png").split(",")[1];});
        await page.locator(".comms-media input[type=file]").first().setInputFiles({name:"qa-photo.png",mimeType:"image/png",buffer:Buffer.from(sample,"base64")});
        await expect(page.locator(".comms-media img")).toBeVisible();
        await shot("09a-photo-preview");
        await page.getByRole("button",{name:ar?"حذف المرفق من المسودة":"Anhang aus Entwurf entfernen",exact:true}).click();
        });
        await section("directory",async()=>{
        await open(base+"/directory",".comms-person-row");
        await shot("10-my-contacts");
        await page.getByRole("button",{name:words.all,exact:true}).click();
        await expect(page.locator(".comms-person-row").first()).toBeVisible();
        await shot("11-all-people");
        await page.getByRole("searchbox",{name:words.search}).fill(targetName);
        await expect(page.locator(".comms-person-row")).toHaveCount(1);
        await shot("12-contact-search");
        await open(base+"/directory?contact="+target!.id,".comms-directory .auth-card");
        await shot("13-contact-detail");
        const candidate=people.find(p=>p.id!==target!.id&&p.displayName==="Johannes Peter Schneider")??people.find(p=>p.id!==target!.id&&p.displayName&&p.target.kind==="person");
        expect(candidate).toBeTruthy();
        await open(base+"/directory",".comms-person-row");
        await page.getByRole("button",{name:words.all,exact:true}).click();
        await page.getByRole("searchbox",{name:words.search}).fill(candidate!.displayName!);
        await expect(page.locator(".comms-person-row").filter({hasText:candidate!.displayName!})).toBeVisible();
        await page.locator(".comms-person-row").filter({hasText:candidate!.displayName!}).click();
        await expect(page.locator(".comms-first-contact")).toBeVisible();
        await page.locator(".comms-composer textarea").fill(longChat);
        await shot("14-first-message");
        });
        await section("feed",async()=>{
        await open(hub+"?section=feed",".comms-feed-card");
        await shot("15-feed-populated");
        await page.getByRole("button",{name:ar?"الأخبار":"Neuigkeiten",exact:true}).click();
        await expect(page.locator(".comms-feed-card").filter({hasText:title[scenario.locale]}).first()).toBeVisible();
        await shot("16-feed-news");
        await page.getByRole("button",{name:ar?"الإعلانات":"Mitteilungen",exact:true}).click();
        await expect(page.locator(".comms-feed-card").filter({hasText:announcementCopy[scenario.locale].title}).first()).toBeVisible();
        await shot("17-feed-announcements");
        await open(base+"/school/more/news?item="+news+"&from=hub",".comms-publication-card");
        await shot("18-news-detail");
        });
        await section("calendar",async()=>{
        await open(hub+"?section=calendar&month="+month,".school-month-grid>button");
        await expect(page.locator(".comms-weekday")).toHaveCount(7);
        await expect(page.locator(".school-month-grid[data-calendar-ready=true] button[data-teaching=yes]").first()).toBeVisible();
        await expect(page.locator(".school-month-dot").first()).toBeVisible();
        await shot("19-calendar-month");
        await page.getByRole("button",{name:ar?"الشهر التالي":"Nächster Monat",exact:true}).click();
        await expect.poll(()=>new URL(page.url()).searchParams.get("month")).toBe(nextMonth);
        await expect(page.locator(".school-month-grid[data-month=\""+nextMonth+"\"][data-calendar-ready=true] button[data-teaching=yes]").first()).toBeVisible();
        await shot("19a-calendar-next-month");
        await open(hub+"?section=calendar&month="+nextMonth+"&classId="+apple.id,".school-month-grid[data-calendar-ready=true] button[data-teaching=no]");
        await shot("19b-calendar-class-holiday");
        await open(hub+"?section=calendar&month="+month+"&day="+day,".school-month-grid>button[aria-pressed=true]");
        await expect(page.locator(".comms-publication-card").filter({hasText:title[scenario.locale]}).first()).toBeVisible();
        await shot("20-calendar-selected-day");
        await open(base+"/school/more/events?item="+event+"&from=hub",".comms-publication-card");
        await shot("21-event-detail");
        });
        await section("notifications",async()=>{
        await open(base+"/school/more/notifications",".comms-notifications");
        await expect(page.locator(".comms-notifications .group-list,.comms-notifications [data-async-state=empty]").first()).toBeVisible();
        await shot("22-notifications");
        await page.getByRole("button",{name:ar?"غير المقروءة":"Ungelesen",exact:true}).click();
        await expect(page.locator(".comms-notice-controls button[aria-pressed=true]")).toBeVisible();
        await expect(page.locator(".comms-notifications .group-list,.comms-notifications [data-async-state=empty]").first()).toBeVisible();
        await shot("22a-notifications-unread");
        if(reportAccess){await open(base+"/school/more/message-reports",".school-content h1");await shot("22b-moderation-queue");}
        });
        await section("broadcast-detail",async()=>{
        if(scenario.persona==="admin"){
          await open(base+"/school/more/broadcasts",".comms-broadcast-navigation");
          await page.getByRole("button",{name:ar?"الإعلانات المنشورة":"Veröffentlichte Mitteilungen",exact:true}).click();
          const sent=page.locator(".comms-broadcast-screen details").filter({hasText:announcementCopy[scenario.locale].title}).first();
          await expect(sent).toBeVisible();await sent.locator("summary").click();
          await shot("23-broadcast-sent-detail");
        }else{
          await open(base+"/school/more/broadcasts?announcement="+broadcast,".comms-broadcast-screen .timetable-day");
          await shot("23-broadcast-received-detail");
        }
        });
        if(scenario.persona!=="guardian"){
          await section("publication-editors",async()=>{
          await open(hub+"?section=feed",".comms-publish-menu>summary");
          await page.locator(".comms-publish-menu>summary").click();
          await shot("24-publish-menu");
          await open(base+"/school/more/news?view=managed&from=hub",".comms-publications .comms-publication-card");
          await shot("25-managed-news");
          await open(base+"/school/more/news?create=1&from=hub",".comms-publications input");
          await shot("26-news-editor");
          await page.getByLabel(ar?"الجمهور":"Zielgruppe").selectOption(scenario.persona==="admin"?"school":apple.id);
          await page.getByLabel(words.title,{exact:true}).fill(title[scenario.locale]);
          await page.getByLabel(words.body,{exact:true}).fill(body[scenario.locale]);
          await page.getByRole("button",{name:ar?"معاينة":"Vorschau",exact:true}).click();
          await expect(page.locator(".comms-publications .notice article")).toBeVisible();
          await shot("26a-news-preview");
          await open(hub+"?section=calendar&month="+month,".comms-calendar-actions");
          await page.getByRole("button",{name:words.newEvent,exact:true}).click();
          await expect(page.locator(".comms-publications input[type=date]")).toBeVisible();
          await shot("27-event-editor");
          await page.getByLabel(ar?"الجمهور":"Zielgruppe").selectOption(scenario.persona==="admin"?"school":apple.id);
          await page.getByLabel(words.title,{exact:true}).fill(title[scenario.locale]);
          await page.getByLabel(words.body,{exact:true}).fill(body[scenario.locale]);
          await page.getByRole("button",{name:ar?"معاينة":"Vorschau",exact:true}).click();
          await expect(page.locator(".comms-publications .notice article")).toBeVisible();
          await shot("27a-event-preview");
          });
          await section("broadcast-compose",async()=>{
          await open(base+"/school/more/broadcasts",".comms-broadcast-navigation");
          const create=page.getByRole("button",{name:ar?"إعلان جديد":"Neue Mitteilung",exact:true});
          await expect(create).toBeVisible();
          await create.click();
          await expect(page.getByLabel(ar?"الجمهور":"Zielgruppe")).toBeVisible();
          await shot("28-broadcast-editor");
          await page.getByLabel(ar?"الجمهور":"Zielgruppe").selectOption("class_guardians");
          await page.getByLabel(ar?"الفصل":"Klasse",{exact:true}).selectOption(apple.id);
          const broadcastForm=page.locator(".comms-broadcast-screen");
          await broadcastForm.getByLabel(words.title,{exact:true}).fill(title[scenario.locale]);
          await broadcastForm.getByLabel(ar?"نص الإعلان":"Text der Mitteilung",{exact:true}).fill(body[scenario.locale]);
          await broadcastForm.locator(".comms-segments").getByRole("button",{name:ar?"الألمانية":"Arabisch",exact:true}).click();
          await broadcastForm.getByLabel(words.title,{exact:true}).fill(title[ar?"de":"ar"]);
          await broadcastForm.getByLabel(ar?"نص الإعلان":"Text der Mitteilung",{exact:true}).fill(body[ar?"de":"ar"]);
          await broadcastForm.getByRole("button",{name:ar?"معاينة الإعلان":"Vorschau erstellen",exact:true}).click();
          await expect(broadcastForm.getByRole("button",{name:ar?"تأكيد النشر":"Veröffentlichung bestätigen",exact:true})).toBeVisible();
          await shot("28a-broadcast-bilingual-preview");
          await page.getByRole("button",{name:ar?"الإعلانات المنشورة":"Veröffentlichte Mitteilungen",exact:true}).click();
          await expect(page.locator(".comms-broadcast-screen .group-list,.comms-broadcast-screen [data-async-state=empty]").first()).toBeVisible();
          await shot("29-broadcast-history");
          });
        }
      }
      expect(issues,"all screenshot states must fit without broken single-line text").toEqual([]);
    }finally{
      writeFileSync(out+"/"+key+"-manifest.json",JSON.stringify({scenario,files,issues,notes},null,2));
      await school.close();
    }
  });
}
