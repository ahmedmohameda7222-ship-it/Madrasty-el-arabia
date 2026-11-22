import {mkdirSync} from "node:fs";
import {expect,test} from "@playwright/test";
import {schoolFixtures} from "../fixtures/school";
import {localOrigin} from "../support/target";

for(const scenario of [
  {actor:"admin",persona:"admin",locale:"ar",width:390},
  {actor:"guardian-de",persona:"guardian",locale:"de",width:320},
  {actor:"admin",persona:"admin",locale:"de",width:1280},
] as const){
  test(scenario.locale+" more disclosure is instant, reversible and reduced-motion-safe at "+scenario.width,async({page,context})=>{
    const school=schoolFixtures();
    try {
      await school.seed();
      const token=await school.bearer(scenario.actor,scenario.persona);
      await context.addCookies([{name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
      await page.setViewportSize({width:scenario.width,height:844});
      await page.goto("/"+scenario.locale+"/school/more");
      const details=page.locator("details.more-group").first();
      const summary=details.locator("summary");
      const rows=details.locator(".more-rows");
      await expect(summary).toBeVisible({timeout:30_000});
      await expect(details).not.toHaveAttribute("open","");
      await summary.focus();
      await page.keyboard.press("Enter");
      await expect(details).toHaveAttribute("open","");
      await expect(rows).toBeVisible();
      const motion=await rows.evaluate(el=>getComputedStyle(el).animationName);
      expect(motion,"high-frequency row disclosure should not use entry-only keyframes").toBe("none");
      const transition=await summary.evaluate(el=>getComputedStyle(el,"::after").transitionDuration);
      expect(Number.parseFloat(transition),"arrow should reverse with short motion").toBeGreaterThanOrEqual(.12);
      expect(Number.parseFloat(transition)).toBeLessThanOrEqual(.16);
      await page.keyboard.press("Enter");
      await expect(details).not.toHaveAttribute("open","");
      await expect(rows).toBeHidden();
      await expect(summary).toBeFocused();
      for(let i=0;i<2;i++){
        await summary.click();
        await expect(details).toHaveAttribute("open","");
        await summary.click();
        await expect(details).not.toHaveAttribute("open","");
      }
      await page.emulateMedia({reducedMotion:"reduce"});
      await summary.click();
      await expect(details).toHaveAttribute("open","");
      const reduced=await summary.evaluate(el=>({
        arrow:getComputedStyle(el,"::after").transitionDuration,
        rows:getComputedStyle(el.nextElementSibling!).animationName
      }));
      expect(Number.parseFloat(reduced.arrow),"reduced-motion arrow instant").toBe(0);
      expect(reduced.rows).toBe("none");
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      mkdirSync("qa-artifacts/ui-after",{recursive:true});
      await page.screenshot({path:"qa-artifacts/ui-after/UIX14-"+scenario.persona+"-"+scenario.locale+"-more-"+scenario.width+"-disclosure-reduced.png",animations:"disabled"});
    } finally {await school.close();}
  });
}
