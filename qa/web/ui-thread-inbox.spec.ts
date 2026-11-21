import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { schoolFixtures } from "../fixtures/school";
import { localOrigin } from "../support/target";

for(const scenario of [
  {actor:"admin",persona:"admin",locale:"ar",width:390},
  {actor:"guardian-de",persona:"guardian",locale:"de",width:320},
] as const){
  test(scenario.locale+" mobile inbox keeps search, filters and empty state within reach",async({page,context})=>{
    const school=schoolFixtures();
    try{
      await school.seed();
      const token=await school.bearer(scenario.actor,scenario.persona);
      await context.addCookies([{name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
      await page.setViewportSize({width:scenario.width,height:844});
      await page.goto("/"+scenario.locale+"/school/messages");
      const form=page.locator(".school-content form").filter({has:page.locator('input[type="search"]')}).first();
      const input=form.locator('input[type="search"]');
      const submit=form.locator('button[type="submit"]');
      await expect(input).toBeVisible();
      await expect(submit).toBeVisible();
      const controls=await Promise.all([input.boundingBox(),submit.boundingBox()]);
      expect(controls[0]).not.toBeNull();expect(controls[1]).not.toBeNull();
      const gap=Math.abs((controls[0]!.y+controls[0]!.height/2)-(controls[1]!.y+controls[1]!.height/2));
      expect(gap,"search action must share input row").toBeLessThanOrEqual(20);
      const filters=page.locator(".inbox-filter-strip");
      await expect(filters).toBeVisible();
      await expect(filters.locator('button[aria-pressed="true"]')).toHaveCount(1);
      expect(await filters.evaluate(el=>el.scrollWidth>=el.clientWidth)).toBe(true);
      const status=page.locator(".school-content [data-async-state='empty'], .school-content .group-list").last();
      await expect(status).toBeVisible({timeout:25000});
      const placement=await status.boundingBox();
      expect(placement!.y,"first result/empty state must appear high on mobile").toBeLessThanOrEqual(450);
      const bodyOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
      expect(bodyOverflow).toBeLessThanOrEqual(1);
      const archive=page.getByRole("button",{name:scenario.locale==="ar"?"المؤرشفة":"Archiviert"});
      await expect(archive).toHaveAttribute("aria-pressed","false");
      await archive.click();
      await expect(archive).toHaveAttribute("aria-pressed","true");
      const extras=page.locator(".inbox-mobile-shortcuts summary");
      await expect(extras).toBeVisible();
      await extras.click();
      await expect(page.getByRole("link",{name:scenario.locale==="ar"?"دليل التواصل":"Kontaktverzeichnis"})).toBeVisible();
      mkdirSync("qa-artifacts/ui-after",{recursive:true});
      await page.screenshot({path:"qa-artifacts/ui-after/UIX10-"+scenario.persona+"-"+scenario.locale+"-messages-"+scenario.width+"-inbox.png",animations:"disabled"});
    }finally{await school.close()}
  });
}
