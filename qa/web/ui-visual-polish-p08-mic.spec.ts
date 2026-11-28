import { expect,test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { schoolFixtures } from "../fixtures/school";
import { setUpCalendar } from "../fixtures/calendar";
import { fixtureApi } from "../support/api";
import { fixtureEmail,localOrigin } from "../support/target";

// Real composer, deliberately rejected hardware request. No audio or message data is captured.
for(const scene of [
  {locale:"de",width:390,mic:"Sprachnachricht aufnehmen",attach:"Anhang hinzufügen",send:"Senden",permission:"Erlaube den Zugriff auf das Mikrofon",actions:["Foto auswählen","Foto aufnehmen","Audio aufnehmen"]},
  {locale:"ar",width:320,mic:"تسجيل رسالة صوتية",attach:"إضافة مرفق",send:"إرسال",permission:"اسمح بالميكروفون",actions:["اختيار صورة","تصوير","سجّل صوت"]},
] as const){
  test("P08 direct microphone permission boundary "+scene.locale,async({page,context,browser,baseURL})=>{
    const school=schoolFixtures(),origin=baseURL??localOrigin;
    const folder=`qa-artifacts/visual-polish/P08/microphone-${scene.locale}/${browser.browserType().name()}`;
    mkdirSync(folder,{recursive:true});
    const events:Record<string,unknown>[]=[];
    const note=(event:string,more:Record<string,unknown>={})=>{if(events.length<80)events.push({event,...more});};
    page.on("framenavigated",f=>{if(f===page.mainFrame())note("document-navigation");});
    page.on("console",m=>{if(m.text().startsWith("QA_MIC_BOUNDARY "))note("browser", {category:m.text().slice(16)});});
    await page.addInitScript(()=>{
      const log=(category:string)=>console.info("QA_MIC_BOUNDARY "+category);
      document.addEventListener("click",event=>{
        if(event.target instanceof Element&&event.target.closest(".comms-send-button"))log("primary-click");
      },true);
      // Observe the actual audio constructor and resume boundary. These
      // wrappers forward to the real implementation and rethrow unchanged.
      // No audio device, fake AudioContext, or success is supplied by the test.
      if(window.AudioContext){
        const Original=window.AudioContext;
        const resume=Original.prototype.resume;
        if(typeof resume==="function"){
          Original.prototype.resume=function(this:AudioContext){
            log("audio-resume-enter");
            try{
              const pending=Reflect.apply(resume,this,[]) as Promise<void>;
              void pending.then(()=>log("audio-resume-resolved"),error=>log("audio-resume-rejected-"+(error instanceof Error?error.name:"unknown")));
              return pending;
            }catch(error){log("audio-resume-threw-"+(error instanceof Error?error.name:"unknown"));throw error;}
          };
        }
        window.AudioContext=new Proxy(Original,{construct(target,args,newTarget){
          log("audio-constructor-enter");
          try{
            const value=Reflect.construct(target,args,newTarget);
            log("audio-constructor-returned");return value;
          }catch(error){log("audio-constructor-threw-"+(error instanceof Error?error.name:"unknown"));throw error;}
        }});
      }
      if(!navigator.mediaDevices){log("mediaDevices-missing");return;}
      Object.defineProperty(navigator.mediaDevices,"getUserMedia",{configurable:true,value:async()=>{
        document.documentElement.dataset.qaMicrophone="requested";
        log("permission-requested");
        throw new DOMException("QA permission denied","NotAllowedError");
      }});
      log("permission-probe-installed");
    });
    try{
      await school.seed();
      await setUpCalendar(school,await school.bearer("admin","admin"));
      const guardian=await school.bearer("guardian-de","guardian");
      const contacts=(await fixtureApi(school,"/directory",{token:guardian,persona:"guardian"})).payload.data;
      const target=contacts.find((c:{displayName:string})=>c.displayName==="يوسف عبد الرحمن محمود")?.target;
      expect(target).toBeTruthy();
      const thread=(await fixtureApi(school,"/threads",{token:guardian,persona:"guardian",method:"POST",key:randomUUID(),body:{target}})).payload.data.threadId;
      expect([localOrigin,"https://127.0.0.1:4443"]).toContain(origin);
      const login=await context.request.post(origin+"/api/v1/auth/sign-in",{headers:{Origin:origin},data:{email:fixtureEmail(school.run,"guardian-de"),password:school.password}});
      expect(login.status()).toBe(200);
      const cookies=await context.cookies(origin);
      expect(cookies.some(c=>c.name===(origin===localOrigin?"madrasty-session":"__Host-madrasty-session")&&c.httpOnly)).toBe(true);
      await page.setViewportSize({width:scene.width,height:844});
      await page.emulateMedia({colorScheme:scene.locale==="ar"?"dark":"light",reducedMotion:"reduce"});
      expect((await page.goto("/"+scene.locale+"/school/messages?thread="+thread))?.status()).toBe(200);
      const composer=page.locator(".comms-composer"),input=composer.locator("textarea");
      const mic=composer.getByRole("button",{name:scene.mic,exact:true});
      const send=composer.getByRole("button",{name:scene.send,exact:true});
      await expect(input).toBeVisible();
      await expect(mic).toBeEnabled();
      await expect(send).toHaveCount(0);
      note("before-click",await page.evaluate(()=>({secure:isSecureContext,audioContext:typeof window.AudioContext,mediaDevices:!!navigator.mediaDevices,mediaMethod:typeof navigator.mediaDevices?.getUserMedia})));
      const hit=await mic.evaluate(el=>{const r=el.getBoundingClientRect();const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {within:!!top&&el.contains(top),width:r.width,height:r.height};});
      expect(hit.within).toBe(true);
      expect(Math.min(hit.width,hit.height)).toBeGreaterThanOrEqual(44);
      await mic.click();
      await expect(page.locator("html")).toHaveAttribute("data-qa-microphone","requested");
      await expect(composer.getByRole("alert")).toContainText(scene.permission);
      await expect(mic).toBeEnabled();
      await page.screenshot({path:folder+"/permission-denied.png"});
      await input.fill("QA unsent draft");
      await expect(send).toBeEnabled();
      await expect(mic).toHaveCount(0);
      await input.fill("   ");
      await expect(mic).toBeEnabled();
      await input.fill("QA unsent draft");
      const toggle=composer.getByRole("button",{name:scene.attach});
      await expect(toggle).toHaveAttribute("aria-expanded","false");
      for(const action of scene.actions)await expect(composer.getByRole("button",{name:action,exact:true})).toBeHidden();
      expect((await composer.boundingBox())!.height).toBeLessThanOrEqual(180);
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded","true");
      for(const action of scene.actions)await expect(composer.getByRole("button",{name:action,exact:true})).toBeVisible();
      await page.screenshot({path:folder+"/media-actions.png"});
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded","false");
      await expect(input).toHaveValue("QA unsent draft");
      for(const action of scene.actions)await expect(composer.getByRole("button",{name:action,exact:true})).toBeHidden();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
    }finally{
      console.log("P08 microphone boundaries",JSON.stringify({locale:scene.locale,browser:browser.browserType().name(),events}));
      await school.close();
    }
  });
}
