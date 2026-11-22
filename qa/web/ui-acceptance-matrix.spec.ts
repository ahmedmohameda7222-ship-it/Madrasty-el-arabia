import {mkdirSync} from "node:fs";
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
