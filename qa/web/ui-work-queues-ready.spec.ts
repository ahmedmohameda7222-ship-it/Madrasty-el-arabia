import assert from "node:assert/strict";
import {expect,test} from "@playwright/test";
import {dashboardModuleKeySchema,schoolQueueKeySchema,workQueuesSchema} from "../../packages/contracts/src/school/work-queues";
import {setUpCalendar} from "../fixtures/calendar";
import {schoolFixtures} from "../fixtures/school";
import {fixtureApi} from "../support/api";
import {localOrigin} from "../support/target";

test("configured administrator sees scoped queue counts and opens every authorized work list",async({page,context})=>{
  const school=schoolFixtures();
  try{
    await school.seed();
    const token=await school.bearer("admin","admin");
    await setUpCalendar(school,token);
    const response=await fixtureApi(school,"/school/work-queues",{token,persona:"admin"});
    const summary=workQueuesSchema.parse(response.payload.data);
    assert.ok(summary.asOf,"the test must use a configured school");
    const names=new Set([...schoolQueueKeySchema.options,...dashboardModuleKeySchema.options]);
    assert.equal(names.size,8,"the original work queue catalogue must keep all eight keys");
    assert.ok(summary.queues.length>0);
    assert.equal(new Set(summary.queues.map(row=>row.key)).size,summary.queues.length);
    assert.ok(summary.queues.every(row=>names.has(row.key)));
    await context.addCookies([{name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
    await page.setViewportSize({width:390,height:844});
    await page.goto("/ar/school/home");
    const main=page.locator(".school-content");
    await expect(main).toBeVisible();
    for(const row of summary.queues){
      if(row.state!=="ready")continue;
      const url=`/ar${row.route}?asOf=${row.filters.asOf}`;
      const link=main.locator(`a.group-row[href="${url}"]`);
      await expect(link).toBeVisible();
      await expect(link.locator("output")).toHaveText(new Intl.NumberFormat("ar").format(row.count));
      const detail=await fixtureApi(school,`/school/work-queues/${row.key}?asOf=${row.filters.asOf}&limit=25`,{
        token,persona:"admin"
      });
      assert.equal(detail.payload.data.asOf,row.filters.asOf);
      if(row.count<=25)assert.equal(detail.payload.data.items.length,row.count);
      const pending=page.waitForResponse(res=>new URL(res.url()).pathname===`/api/v1/school/work-queues/${row.key}`);
      await link.click();
      const loaded=await pending;
      expect(loaded.status(),`authorized work queue ${row.key}`).toBe(200);
      await expect(page).toHaveURL(new RegExp(`/ar/school/home/queues/${row.key}\\?asOf=`));
      await expect(main.locator('[data-async-state="forbidden"],[data-async-state="error"]')).toHaveCount(0);
      await page.goBack();
      await expect(link).toBeVisible();
    }
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
    expect(overflow,"mobile administration work list must not overflow").toBeLessThanOrEqual(1);
  }finally{await school.close();}
});
