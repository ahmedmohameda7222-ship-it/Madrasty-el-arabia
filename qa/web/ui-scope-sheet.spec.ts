import {mkdirSync} from "node:fs";
import {expect,test} from "@playwright/test";
import {schoolFixtures} from "../fixtures/school";
import {localOrigin} from "../support/target";

for(const scenario of [
  {actor:"guardian-ar",locale:"ar",route:"home",width:390},
  {actor:"guardian-de",locale:"de",route:"children",width:320},
] as const){
  test(scenario.locale+" native scope sheet preserves modal, focus, repeat-open and reduced motion",async({page,context})=>{
    const school=schoolFixtures();
    try{
      await school.seed();
      const token=await school.bearer(scenario.actor,"guardian");
      await context.addCookies([{name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
      await page.setViewportSize({width:scenario.width,height:844});
      await page.goto("/"+scenario.locale+"/school/"+scenario.route);
      const trigger=page.locator(".school-content .auth-card > button.plain-button").first();
      await expect(trigger).toBeVisible({timeout:30_000});
      const dialog=page.locator(".school-content dialog.scope-sheet:not(.app-settings-sheet)");
      await expect(dialog).toHaveCount(1);
      await expect(page.locator("dialog.app-settings-sheet")).toHaveCount(1);
      await expect(dialog).toBeAttached();
      await expect(dialog).not.toBeVisible();
      for(let attempt=0;attempt<2;attempt++){
        await trigger.click();
        await expect(dialog).toBeVisible();
        expect(await dialog.evaluate((element)=>element.matches(":modal"))).toBe(true);
        const geometry=await dialog.evaluate(element=>{
          const rect=element.getBoundingClientRect();
          const backdrop=getComputedStyle(element,"::backdrop");
          const alpha=Number(backdrop.backgroundColor.match(/[\d.]+\)\s*$/)?.[0]?.replace(")","")??"0");
          return {bottom:rect.bottom,right:rect.right,left:rect.left,alpha,overflow:element.scrollWidth-element.clientWidth};
        });
        expect(Math.abs(geometry.bottom-844),"sheet must be anchored at viewport bottom").toBeLessThanOrEqual(8);
        expect(geometry.right).toBeLessThanOrEqual(scenario.width+1);
        expect(geometry.left).toBeGreaterThanOrEqual(-1);
        expect(geometry.overflow).toBeLessThanOrEqual(1);
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
        await expect(trigger).toBeFocused();
      }
      await page.emulateMedia({reducedMotion:"reduce"});
      await trigger.click();
      await expect(dialog).toBeVisible();
      const motion=await dialog.evaluate(el=>({animation:getComputedStyle(el).animationName,transition:getComputedStyle(el).transitionDuration}));
      expect(motion.animation,"reduced motion does not force entrance animation").toBe("none");
      const rows=dialog.locator("button.group-row");
      await expect(rows.first()).toBeVisible();
      await rows.last().click();
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
      mkdirSync("qa-artifacts/ui-after",{recursive:true});
      await trigger.click();
      await page.screenshot({path:"qa-artifacts/ui-after/UIX13-guardian-"+scenario.locale+"-"+scenario.route+"-"+scenario.width+"-sheet-open-reduced.png",animations:"disabled"});
      await expect(dialog).toBeVisible();
      await dialog.locator("form[method='dialog'] button").click();
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
      await expect(page.locator("html")).toHaveAttribute("dir",scenario.locale==="ar"?"rtl":"ltr");
    }finally{await school.close();}
  });
}
