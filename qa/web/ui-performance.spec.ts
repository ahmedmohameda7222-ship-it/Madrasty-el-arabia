import {mkdirSync,writeFileSync} from "node:fs";
import {expect,test} from "@playwright/test";
import {schoolFixtures} from "../fixtures/school";
import {setUpCalendar} from "../fixtures/calendar";
import {localOrigin} from "../support/target";

for(const scenario of [
  {principal:"admin",persona:"admin",tab:"students",locale:"ar"},
  {principal:"teacher",persona:"teacher",tab:"attendance",locale:"de"},
  {principal:"guardian-ar",persona:"guardian",tab:"children",locale:"ar"},
] as const){
  test("record mobile navigation timings: "+scenario.persona,async({page,context},testInfo)=>{
    test.setTimeout(180_000);
    const school=schoolFixtures();
    const samples:{tab:string;iteration:number;navigationMs:number}[]=[];
    const api:{path:string;status:number;timing:string}[]=[];
    try{
      await school.seed();
      const admin=await school.bearer("admin","admin");
      await setUpCalendar(school,admin);
      const token=scenario.persona==="admin"?admin:await school.bearer(scenario.principal,scenario.persona);
      await context.addCookies([{name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
      await page.setViewportSize({width:390,height:844});
      page.on("response",response=>{
        const url=new URL(response.url());
        if(url.origin!==localOrigin||!url.pathname.startsWith("/api/v1/"))return;
        const path=url.pathname.replace(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/gi,":id");
        api.push({path,status:response.status(),timing:response.headers()["server-timing"]??""});
      });
      const root="/"+scenario.locale+"/school/";
      await page.goto(root+"home");
      const main=page.locator(".school-content");
      await expect(main).toBeVisible();
      for(let iteration=0;iteration<2;iteration++)for(const tab of [scenario.tab,"messages","calendar","more","home"]){
        const link=page.locator('.school-nav > a[href*="/school/'+tab+'"]');
        await expect(link).toBeVisible();
        const started=performance.now();
        await link.click();
        await expect(page).toHaveURL(new RegExp("/school/"+tab+"(?:\\?.*)?$"));
        await expect(link).toHaveAttribute("aria-current","page");
        await expect(main).toBeVisible();
        await expect(main.locator(".school-route-loading")).toHaveCount(0);
        samples.push({tab,iteration,navigationMs:Math.round(performance.now()-started)});
        await expect(main.locator('[data-async-state="loading"]')).toHaveCount(0,{timeout:30_000});
        await expect(main.locator('[data-async-state="error"],[data-async-state="forbidden"]')).toHaveCount(0);
      }
      mkdirSync("qa-artifacts/performance",{recursive:true});
      writeFileSync("qa-artifacts/performance/navigation-"+scenario.persona+"-"+testInfo.project.name+".json",JSON.stringify({
        head:process.env.GITHUB_SHA??"local",environment:"isolated synthetic QA (Next dev)",viewport:390,scenario,samples,api
      },null,2)+"\n");
    }finally{await school.close();}
  });
}
