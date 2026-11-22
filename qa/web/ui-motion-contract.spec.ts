import {readFileSync,mkdirSync} from "node:fs";
import {expect,test} from "@playwright/test";
import {schoolFixtures} from "../fixtures/school";
import {localOrigin} from "../support/target";

const source=readFileSync("apps/web/src/app/school.css","utf8").replace(/\/\*[\s\S]*?\*\//g,"");

test("whole-web motion CSS has no forbidden keyframes, all-transitions or zero-scale entrances",()=>{
  expect(source).not.toMatch(/transition\s*:\s*all\b/i);
  expect(source).not.toMatch(/scale\(\s*0(?:\.0+)?\s*\)/i);
  expect([...source.matchAll(/@keyframes\s+([\w-]+)/g)].map((m)=>m[1])).toEqual(["pulse"]);
  expect(source).toMatch(/@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{\s*\.skeleton-row span\s*\{\s*animation:\s*pulse/);
  expect(source).not.toMatch(/\.more-rows\s*\{[^}]*animation:/);
  expect(source).toMatch(/@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)\s*\{/);
  expect(source).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/);
});

test("infrequent More arrow follows the shared Emil easing token while frequent navigation has no entry motion",async({page,context})=>{
  const school=schoolFixtures();
  try {
    await school.seed();
    const token=await school.bearer("admin","admin");
    await context.addCookies([{name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
    await page.setViewportSize({width:390,height:844});
    await page.goto("/ar/school/more");
    const summary=page.locator(".more-group summary").first();
    await expect(summary).toBeVisible();
    await summary.click();
    const observed=await summary.evaluate(el=>{
      const arrow=getComputedStyle(el,"::after");
      const rows=el.nextElementSibling!;
      const root=getComputedStyle(document.documentElement);
      return {
        arrowEase:arrow.transitionTimingFunction,
        sharedEase:root.getPropertyValue("--ease-out").trim(),
        arrowDuration:arrow.transitionDuration,
        rowsAnimation:getComputedStyle(rows).animationName
      };
    });
    expect(observed.arrowEase,"arrow must reuse existing strong ease-out token rather than weak built-in ease-out").toBe(observed.sharedEase);
    expect(observed.arrowDuration).toBe("0.14s");
    expect(observed.rowsAnimation).toBe("none");
    await page.emulateMedia({reducedMotion:"reduce"});
    const reduced=await summary.evaluate(el=>({
      duration:getComputedStyle(el,"::after").transitionDuration,
      rows:getComputedStyle(el.nextElementSibling!).animationName
    }));
    expect(reduced.duration).toBe("0s");
    expect(reduced.rows).toBe("none");
    mkdirSync("qa-artifacts/ui-after",{recursive:true});
    await page.screenshot({path:"qa-artifacts/ui-after/UIX15-admin-ar-more-390-reduced-motion.png",animations:"disabled"});
  }finally{await school.close();}
});
