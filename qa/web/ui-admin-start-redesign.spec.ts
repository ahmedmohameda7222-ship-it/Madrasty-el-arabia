import {mkdirSync} from "node:fs";
import {expect,test} from "@playwright/test";
import {schoolFixtures} from "../fixtures/school";
import {setUpCalendar} from "../fixtures/calendar";
import {fixtureApi} from "../support/api";
import {schoolClock as clock} from "../fixtures/clock";
import {localOrigin} from "../support/target";

test("admin dashboard is compact, localized, theme-safe and uses real notebook and data",async({page,context})=>{
  test.setTimeout(180_000);
  const school=schoolFixtures();
  try{
    await school.seed();
    const admin=await school.bearer("admin","admin");
    const teacher=await school.bearer("teacher","teacher");
    const {apple}=await setUpCalendar(school,admin);
    const path=`/attendance/classes/${apple.id}/days/${clock.day}`;
    const write=(suffix:string)=>({method:"POST" as const,token:teacher,persona:"teacher" as const,key:school.run+".visual."+suffix});
    const sheet=(await fixtureApi(school,path+"/open",{...write("open"),body:{},status:[200,201]})).payload.data;
    await fixtureApi(school,`/attendance/sheets/${sheet.id}/mark-present`,{...write("mark"),body:{rows:sheet.rows.map((row:{id:string;revision:number})=>({rowId:row.id,revision:row.revision}))}});
    const current=(await fixtureApi(school,path,{token:teacher})).payload.data;
    await fixtureApi(school,`/attendance/sheets/${sheet.id}/approve`,{...write("approve"),body:{approvalRevision:current.approvalRevision,expectedRows:current.rows.map((row:{id:string;revision:number})=>({rowId:row.id,revision:row.revision}))}});
    await context.addCookies([{name:"madrasty-session",value:admin,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
    mkdirSync("qa-artifacts/admin-start",{recursive:true});
    for(const locale of ["de","ar"] as const)for(const width of [320,390])for(const theme of ["light","dark"] as const){
      await page.setViewportSize({width,height:844});
      await page.emulateMedia({colorScheme:theme});
      await page.goto(`/${locale}/school/home`);
      const main=page.locator(".school-content");
      await expect(main.locator(".admin-start-hero .role-hero img")).toHaveAttribute("src","/notebook-admin.svg",{timeout:30000});
      await expect(main.locator(".admin-start-metrics > div")).toHaveCount(3);
      await expect(main.locator(".admin-start-ring")).toBeVisible();
      await expect(main.locator(".admin-start-split")).toBeVisible();
      await expect(main.locator(".admin-start-actions a")).toHaveCount(4);
      await expect(main.locator("a.group-row")).toHaveCount(0);
      await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;},theme);
      await main.evaluate(el=>el.scrollTop=0);
      const sizes=await main.evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth}));
      expect(sizes.scroll-sizes.client).toBeLessThanOrEqual(1);
      await page.screenshot({path:`qa-artifacts/admin-start/${locale}-${width}-${theme}-top.png`,animations:"disabled"});
      await main.evaluate(el=>el.scrollTop=el.scrollHeight);
      await page.screenshot({path:`qa-artifacts/admin-start/${locale}-${width}-${theme}-bottom.png`,animations:"disabled"});
    }
  }finally{await school.close();}
});
