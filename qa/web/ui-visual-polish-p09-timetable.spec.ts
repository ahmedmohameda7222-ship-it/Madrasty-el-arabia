import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { schoolFixtures } from "../fixtures/school";
import { setUpCalendar } from "../fixtures/calendar";
import { schoolClock as clock } from "../fixtures/clock";
import { fixtureApi } from "../support/api";
import { fixtureEmail, localOrigin } from "../support/target";
import { timetablePreviewSchema, timetableWeekSchema } from "../../packages/contracts/src/school/timetable";

const words = {
  de: { title: "Wochenplan", choose: "Klasse auswählen", next: "Nächste Woche", previous: "Vorige Woche", add: "+ Stunde hinzufügen", build: "Stundenplan erstellen", close: "Schließen", edit: "Termin bearbeiten", child: "Kind auswählen", date: "Woche mit Datum" },
  ar: { title: "الجدول الأسبوعي", choose: "اختار الفصل", next: "الأسبوع التالي", previous: "الأسبوع السابق", add: "+ إضافة حصة", build: "إعداد الجدول", close: "إغلاق", edit: "تعديل موعد", child: "اختر طالب", date: "الأسبوع الذي يتضمن" },
} as const;
const scenes = [
  { actor: "admin", persona: "admin" }, { actor: "teacher", persona: "teacher" },
  { actor: "guardian-de", persona: "guardian" },
] as const;
const minutes=(value:number)=>String(Math.floor(value/60)).padStart(2,"0")+":"+String(value%60).padStart(2,"0");

async function reflow(page: Page) {
  return page.locator(".school-content").evaluate(root => {
    const box=root.getBoundingClientRect();
    const controls=[...root.querySelectorAll("button, select, input:not([type=checkbox]):not([type=radio]), label:has(input[type=checkbox]), label:has(input[type=radio])")].filter(el=>el.getClientRects().length>0);
    const targets=controls.map(el=>{const r=el.getBoundingClientRect();return {w:r.width,h:r.height,within:r.left>=box.left-1&&r.right<=box.right+1};});
    const clipped=[...root.querySelectorAll("article h3, article time, article strong, article small, article p, article h3+span")].filter(el=>el.getClientRects().length>0).flatMap(el=>{
      const range=document.createRange();range.selectNodeContents(el);
      const article=el.closest("article")!.getBoundingClientRect();
      return [...range.getClientRects()].some(r=>r.left<article.left-1||r.right>article.right+1)?[el.tagName]:[];
    });
    return {overflow:Math.max(root.scrollWidth-root.clientWidth,document.documentElement.scrollWidth-innerWidth),
      count:targets.length,minHeight:Math.min(...targets.map(t=>t.h)),minWidth:Math.min(...targets.map(t=>t.w)),within:targets.every(t=>t.within),clipped};
  });
}
for (const scene of scenes) for(const locale of ["de","ar"] as const) {
  test("P09 timetable " + scene.persona + " " + locale, async ({page,context,browser,baseURL}) => {
    const school=schoolFixtures(), w=words[locale];
    const production=baseURL==="https://127.0.0.1:4443";
    const origin=production?baseURL:localOrigin;
    expect(baseURL).toBe(origin);
    const width=locale==="ar"?320:390;
    const folder=`qa-artifacts/visual-polish/P09/timetable-${scene.persona}-${locale}-${width}/${browser.browserType().name()}`;
    mkdirSync(folder,{recursive:true});
    try {
      await school.seed();
      const admin=await school.bearer("admin","admin");
      const {year,apple,offering,room,ids}=await setUpCalendar(school,admin);
      // Populate the designated local fixture with one real lesson if needed.
      // No mock API, no product write during the visual journey.
      const query="/school/timetable?classId="+apple.id;
      let week=timetableWeekSchema.parse((await fixtureApi(school,query,{token:admin,persona:"admin"})).payload.data);
      if(!week.slots.length){
        const draft={assignmentId:offering.id,subjectId:offering.subjectId,roomId:room.id,weekday:clock.weekday,start:540,end:600,from:clock.startsOn,untilExclusive:clock.endsExclusive};
        const preview=timetablePreviewSchema.parse((await fixtureApi(school,"/school/timetable/preview",{token:admin,persona:"admin",method:"POST",body:{yearId:year.id,slots:[draft]}})).payload.data);
        expect(preview.canSave).toBe(true);
        expect(preview.entries[0]?.slot).toBeTruthy();
        await fixtureApi(school,"/school/timetable",{token:admin,persona:"admin",method:"POST",key:school.run+".visual-weekly-lesson",status:[200,201],body:{yearId:year.id,yearRevision:preview.yearRevision,slots:preview.entries.map(e=>e.slot)}});
        week=timetableWeekSchema.parse((await fixtureApi(school,query,{token:admin,persona:"admin"})).payload.data);
      }
      expect(week.slots.length).toBeGreaterThan(0);
      const token=scene.persona==="admin"?admin:await school.bearer(scene.actor,scene.persona);
      const expected=scene.persona==="admin"?week:timetableWeekSchema.parse((await fixtureApi(school,
        "/school/timetable"+(scene.persona==="guardian"?"?childId="+ids.ahmed:""),{token,persona:scene.persona})).payload.data);
      expect(expected.slots.length).toBeGreaterThan(0);
      if(production){
        const login=await context.request.post(origin+"/api/v1/auth/sign-in",{headers:{Origin:origin},data:{email:fixtureEmail(school.run,scene.actor),password:school.password}});
        expect(login.status()).toBe(200);
        if(scene.persona==="admin"){
          await page.goto("/de/account/security");
          await page.locator('input[name="code"]').fill((await school.localMfa("admin")).code());
          await page.getByRole("button",{name:"Bestätigen",exact:true}).click();
          await expect(page).toHaveURL(/\/de\/school\/home(?:\?.*)?$/);
        }
        expect((await context.cookies(origin)).some(c=>c.name==="__Host-madrasty-session"&&c.secure&&c.httpOnly)).toBe(true);
      }else{
        await context.addCookies([{name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
      }
      // Fresh page avoids counting prior development HMR document reloads.
      const view=await context.newPage();
      await view.setViewportSize({width,height:844});
      await view.emulateMedia({colorScheme:locale==="ar"?"dark":"light",reducedMotion:"reduce"});
      const route="/"+locale+"/school/more/timetable"+(scene.persona==="guardian"?"?child="+ids.ahmed:"");
      expect((await view.goto(origin+route))?.status()).toBe(200);
      await expect(view.getByRole("heading",{name:w.title,exact:true,level:1})).toBeVisible();
      if(scene.persona==="admin"){
        await expect(view.getByRole("heading",{name:w.choose,exact:true})).toBeVisible();
        const classButton=view.getByRole("button").filter({hasText:locale==="ar"?apple.nameAr:apple.nameDe});
        await expect(classButton).toBeVisible();
        await view.screenshot({path:folder+"/timetable-classes.png"});
        await classButton.click();
      }else if(scene.persona==="guardian") {
        await expect(view.getByLabel(w.child,{exact:true})).toHaveValue(ids.ahmed);
      }
      const grid=view.getByRole("region",{name:w.title,exact:true});
      await expect(grid.locator("article")).toHaveCount(7);
      await expect(grid.locator("time")).toHaveCount(expected.slots.length);
      expect(await grid.locator("time").allTextContents()).toEqual(expected.slots.map(slot=>minutes(slot.start)+" – "+minutes(slot.end)));
      await expect(grid.locator('time[dir="ltr"]')).toHaveCount(expected.slots.length);
      const next=view.getByRole("button",{name:w.next,exact:true}), previous=view.getByRole("button",{name:w.previous,exact:true});
      await expect(next).toBeEnabled();
      await expect(previous).toBeEnabled();
      await view.evaluate(()=>document.fonts.ready.then(()=>undefined));
      const normal=await reflow(view);
      await view.screenshot({path:folder+"/timetable-week.png"});
      await view.evaluate(()=>{document.documentElement.style.fontSize="200%";});
      const large=await reflow(view);
      await grid.scrollIntoViewIfNeeded();
      await view.screenshot({path:folder+"/timetable-week-text-200.png"});
      for(const control of [next,previous]){
        await control.scrollIntoViewIfNeeded();
        await expect(control).toBeInViewport();
      }
      await view.evaluate(()=>{document.documentElement.style.fontSize="100%";});
      await next.click();
      const date=view.getByLabel(w.date,{exact:true});
      await expect(date).not.toHaveValue(expected.weekOf);
      await expect(grid.locator("article")).toHaveCount(7);
      await previous.click();
      await expect(date).toHaveValue(expected.weekOf);
      await expect(grid.locator("time")).toHaveCount(expected.slots.length);
      const edits=grid.getByRole("button",{name:w.edit,exact:true});
      let editorNormal=null,editorLarge=null;
      if(scene.persona==="admin"){
        await expect(edits).toHaveCount(expected.slots.length);
        await view.getByRole("button",{name:w.add,exact:true}).click();
        const editor=view.getByRole("region",{name:w.build,exact:true});
        await expect(editor.getByRole("heading",{name:w.build,exact:true})).toBeVisible();
        await expect(editor.locator('input[type="checkbox"]')).toHaveCount(7);
        await expect(editor.locator('input[type="checkbox"]:checked')).toHaveCount(1);
        await expect(editor.getByRole("button",{name:locale==="ar"?"أضف الموعد للمراجعة":"Termin zur Prüfung hinzufügen",exact:true})).toBeDisabled();
        editorNormal=await reflow(view);
        await editor.scrollIntoViewIfNeeded();
        await view.screenshot({path:folder+"/timetable-editor.png"});
        await view.evaluate(()=>{document.documentElement.style.fontSize="200%";});
        editorLarge=await reflow(view);
        await editor.scrollIntoViewIfNeeded();
        await view.screenshot({path:folder+"/timetable-editor-text-200.png"});
        await editor.getByRole("button",{name:w.close,exact:true}).click();
        await expect(editor).toHaveCount(0);
      }else{
        await expect(edits).toHaveCount(0);
        await expect(view.getByRole("button",{name:w.add,exact:true})).toHaveCount(0);
      }
      const evidence={role:scene.persona,locale,width,normal,large,editorNormal,editorLarge};
      console.log("P09 timetable geometry",JSON.stringify(evidence));
      writeFileSync(folder+"/geometry.json",JSON.stringify(evidence,null,2));
      for(const state of [normal,large,editorNormal,editorLarge]){
        if(!state)continue;
        expect.soft(state.count).toBeGreaterThan(0);
        expect.soft(state.overflow).toBeLessThanOrEqual(1);
        expect.soft(state.within).toBe(true);
        expect.soft(state.minHeight).toBeGreaterThanOrEqual(44);
        expect.soft(state.minWidth).toBeGreaterThanOrEqual(44);
        expect.soft(state.clipped).toEqual([]);
      }
    }finally{await school.close();}
  });
}
