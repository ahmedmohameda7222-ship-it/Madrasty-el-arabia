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
      await expect(submit).toHaveCount(0);
      const query="QA-search-inbox";
      const searched=page.waitForResponse(r=>r.url().includes("/api/v1/threads?")&&new URL(r.url()).searchParams.get("q")===query&&r.request().method()==="GET");
      await input.fill(query);
      expect((await searched).ok()).toBe(true);
      await expect.poll(()=>new URL(page.url()).searchParams.get("q")).toBe(query);
      const cleared=page.waitForResponse(r=>r.url().includes("/api/v1/threads?")&&!new URL(r.url()).searchParams.has("q")&&r.request().method()==="GET");
      await input.fill("");
      expect((await cleared).ok()).toBe(true);
      await expect.poll(()=>new URL(page.url()).searchParams.has("q")).toBe(false);
      const refresh=page.waitForResponse(r=>r.url().includes("/api/v1/threads?")&&r.request().method()==="GET");
      await page.getByRole("button",{name:scenario.locale==="ar"?"تحديث":"Aktualisieren",exact:true}).click();
      expect((await refresh).ok()).toBe(true);
      const filters=page.locator(".inbox-filter-strip");
      await expect(filters).toBeVisible();
      await expect(filters.locator('button[aria-pressed="true"]')).toHaveCount(1);
      const visualState = await filters.evaluate(el=>{
        const active=el.querySelector('button[aria-pressed="true"]');
        const inactive=el.querySelector('button[aria-pressed="false"]');
        if(!active||!inactive)throw new Error("missing real filter choices");
        return {activeBg:getComputedStyle(active).backgroundColor,inactiveBg:getComputedStyle(inactive).backgroundColor};
      });
      expect(visualState.activeBg,"selected filter requires visible contrast").not.toBe(visualState.inactiveBg);
      expect(await filters.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
      const filterBounds=await filters.evaluate(el=>Array.from(el.querySelectorAll("button")).map(button=>{const outer=el.getBoundingClientRect(),bounds=button.getBoundingClientRect();return {inside:bounds.left>=outer.left-1&&bounds.right<=outer.right+1,height:bounds.height};}));
      expect(filterBounds).toHaveLength(3);
      for(const bounds of filterBounds){expect(bounds.inside).toBe(true);expect(bounds.height).toBeGreaterThanOrEqual(44);}
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
      await expect(page.getByRole("link",{name:scenario.locale==="ar"?"رسالة جديدة":"Neue Nachricht"})).toBeVisible();
      await expect(page.locator(".inbox-mobile-shortcuts")).toHaveCount(0);
      await expect(status).toBeVisible({timeout:25000});
      mkdirSync("qa-artifacts/ui-after",{recursive:true});
      await page.screenshot({path:"qa-artifacts/ui-after/UIX10-"+scenario.persona+"-"+scenario.locale+"-messages-"+scenario.width+"-inbox.png",animations:"disabled"});
    }finally{await school.close()}
  });
}

test("communication entry links remain inside their touch targets at 320px",async({page,context})=>{
  const school=schoolFixtures();
  try{
    await school.seed();
    const token=await school.bearer("guardian-de","guardian");
    await context.addCookies([{name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
    await page.setViewportSize({width:320,height:844});
    await page.goto("/de/school/messages");
    for(const name of ["Neue Nachricht","Aktuelles","Kalender"]){
      const link=page.getByRole("link",{name});
      await expect(link).toBeVisible();
      const bounds=await link.evaluate(el=>{
        const box=el.getBoundingClientRect();
        const range=document.createRange();
        range.selectNodeContents(el);
        const content=range.getBoundingClientRect();
        return {textLeft:content.left,textRight:content.right,left:box.left,right:box.right,width:box.width,height:box.height};
      });
      expect(bounds.textLeft,name+" starts inside target").toBeGreaterThanOrEqual(bounds.left-1);
      expect(bounds.textRight,name+" ends inside target").toBeLessThanOrEqual(bounds.right+1);
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
    }
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
    expect(overflow,"expanded links do not create page overflow").toBeLessThanOrEqual(1);
  }finally{await school.close();}
});
