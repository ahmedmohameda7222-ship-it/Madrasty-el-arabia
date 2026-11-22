import {mkdirSync,writeFileSync} from "node:fs";
import {expect,test} from "@playwright/test";
import {schoolFixtures} from "../fixtures/school";
import {localOrigin} from "../support/target";

test("German 320px message bottom tab never splits a word and retains its full accessible name",async({page,context})=>{
  const school=schoolFixtures();
  try {
    await school.seed();
    const token=await school.bearer("guardian-de","guardian");
    await context.addCookies([{name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
    await page.setViewportSize({width:320,height:844});
    await page.goto("/de/school/more");
    const nav=page.locator('.school-nav a[href*="/messages"]');
    await expect(nav).toBeVisible();
    const label=nav.locator("span").first();
    const dimensions=await label.evaluate(el=>{
      const rect=el.getBoundingClientRect();
      const css=getComputedStyle(el);
      return {height:rect.height,lineHeight:parseFloat(css.lineHeight),width:rect.width};
    });
    expect(dimensions.height,"mobile message tab must stay one line at narrow 320px").toBeLessThanOrEqual(dimensions.lineHeight+2);
    await expect(nav).toHaveAttribute("aria-label","Nachrichten");
    const target=await nav.boundingBox();
    expect(target!.height).toBeGreaterThanOrEqual(44);
    expect(target!.width).toBeGreaterThanOrEqual(44);
    mkdirSync("qa-artifacts/ui-after",{recursive:true});
    await page.screenshot({path:"qa-artifacts/ui-after/UIX17-guardian-de-more-320-message-tab.png",animations:"disabled"});
  }finally{await school.close();}
});


const acceptanceScenarios=[
  {actor:"admin",persona:"admin",locale:"ar",detail:"students"},
  {actor:"admin",persona:"admin",locale:"de",detail:"students"},
  {actor:"teacher",persona:"teacher",locale:"ar",detail:"attendance"},
  {actor:"teacher",persona:"teacher",locale:"de",detail:"attendance"},
  {actor:"guardian-ar",persona:"guardian",locale:"ar",detail:"children"},
  {actor:"guardian-de",persona:"guardian",locale:"de",detail:"children"},
] as const;
const viewportWidths=[320,390,430,768,1024,1280] as const;

for(const scenario of acceptanceScenarios){
  test("UIX17 "+scenario.persona+" "+scenario.locale+" shared shell and role screens across six viewport widths",async({page,context},testInfo)=>{
    const school=schoolFixtures();
    const captures:{sha:string;role:string;locale:string;route:string;width:number;mode:string;state:string;path:string}[]=[];
    const suiteLabel=scenario.persona+"-"+scenario.locale;
    try{
      await school.seed();
      const token=await school.bearer(scenario.actor,scenario.persona);
      await context.addCookies([{name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
      mkdirSync("qa-artifacts/ui-after",{recursive:true});
      mkdirSync("qa-artifacts/ui-manifests",{recursive:true});
      const capture=async(route:string,width:number,mode:"standard"|"dark-reduced"|"text-200")=>{
        await page.setViewportSize({width,height:844});
        await page.emulateMedia({colorScheme:mode==="standard"?"light":"dark",reducedMotion:mode==="standard"?"no-preference":"reduce"});
        // The synthetic fixture has no school calendar yet. Teacher attendance is
        // an explicit service-unavailable acceptance state, NOT a verified ready sheet.
        // Keep the strict ready/forbidden gate on every other page.
        const expectedAttendanceError=scenario.persona==="teacher"&&route==="attendance";
        const attendanceResponse=expectedAttendanceError
          ? page.waitForResponse(response=>new URL(response.url()).pathname==="/api/v1/attendance/classes"&&response.status()===503)
          : null;
        await page.goto("/"+scenario.locale+"/school/"+route);
        await expect(page).toHaveURL(new RegExp("/"+scenario.locale+"/school/"+route.replaceAll("/","\\/")+"(?:\\?.*)?$"));
        const main=page.locator(".school-content");
        await expect(main).toBeVisible({timeout:30000});
        await expect(main.locator('[data-async-state="loading"]')).toHaveCount(0,{timeout:30000});
        if(expectedAttendanceError){
          const response=await attendanceResponse!;
          const payload=await response.json() as {error?:{code?:string}};
          expect(payload.error?.code,"only the specific unconfigured-school error is expected").toBe("unavailable");
          await expect(main.locator('[data-async-state="error"]')).toBeVisible();
          await expect(main.locator('[data-async-state="forbidden"]')).toHaveCount(0);
          await expect(main.getByRole("alert")).toBeVisible();
          await expect(main.getByRole("button",{name:scenario.locale==="ar"?"إعادة المحاولة":"Erneut versuchen"})).toBeVisible();
        }else{
          await expect(main.locator('[data-async-state="error"],[data-async-state="forbidden"]')).toHaveCount(0);
        }
        await expect(page.locator("html")).toHaveAttribute("dir",scenario.locale==="ar"?"rtl":"ltr");
        if(mode==="text-200"){
          await page.evaluate(()=>document.documentElement.style.fontSize="200%");
        }else{
          await page.evaluate(()=>document.documentElement.style.removeProperty("font-size"));
        }
        const nav=page.locator(".school-nav a");
        await expect(nav).toHaveCount(4);
        for(const target of await nav.all()){
          const rect=await target.boundingBox();
          expect(rect).not.toBeNull();
          expect(rect!.width,"navigation touch target width").toBeGreaterThanOrEqual(44);
          expect(rect!.height,"navigation touch target height").toBeGreaterThanOrEqual(44);
        }
        const horizontal=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
        expect(horizontal,"document horizontal overflow "+suiteLabel+" "+route+" "+width+" "+mode).toBeLessThanOrEqual(1);
        const state=await main.evaluate(el=>{
          const empty=el.querySelector('[data-async-state="empty"],[data-async-state="filtered-empty"]');
          if(el.querySelector('[data-async-state="error"]'))return "error-unconfigured-school-calendar";
          return empty?"empty":"ready";
        });
        expect(state,"teacher attendance must never be falsely marked ready").toBe(expectedAttendanceError?"error-unconfigured-school-calendar":state);
        if(!expectedAttendanceError)expect(state).not.toBe("error-unconfigured-school-calendar");
        const path="qa-artifacts/ui-after/UIX17-"+suiteLabel+"-"+route.replaceAll("/","-")+"-"+width+"-"+mode+".png";
        await page.screenshot({path,animations:"disabled"});
        captures.push({sha:process.env.GITHUB_SHA??"local",role:scenario.persona,locale:scenario.locale,route,width,mode,state,path});
      };
      for(const width of viewportWidths)await capture("more",width,"standard");
      for(const width of [390,1280])await capture("home",width,"standard");
      for(const width of [390,1280])await capture(scenario.detail,width,"standard");
      for(const width of [320,390,430])await capture("messages",width,"standard");
      await capture("home",390,"text-200");
      await capture("more",430,"dark-reduced");
      const report="qa-artifacts/ui-manifests/UIX17-"+suiteLabel+"-captures.json";
      writeFileSync(report,JSON.stringify({head:process.env.GITHUB_SHA??"local",browser:testInfo.project.name,scenes:captures},null,2)+"\n");
      expect(captures).toHaveLength(15);
    }finally{await school.close();}
  });
}
