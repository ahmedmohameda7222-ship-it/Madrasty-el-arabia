import {readFileSync,mkdirSync} from "node:fs";
import {expect,test} from "@playwright/test";
import {schoolFixtures} from "../fixtures/school";
import {localOrigin} from "../support/target";

test("web iOS viewport and Android Compose shell retain existing native safe-area contracts",()=>{
  const layout=readFileSync("apps/web/src/app/[locale]/layout.tsx","utf8");
  const css=readFileSync("apps/web/src/app/school.css","utf8");
  const android=readFileSync("apps/android/app/src/main/java/de/madrasty/app/ui/SchoolShell.kt","utf8");
  expect(layout).toMatch(/viewportFit:\s*"cover"/);
  expect(layout).toMatch(/width:\s*"device-width"/);
  expect(layout).toMatch(/initialScale:\s*1/);
  expect(layout).not.toMatch(/maximumScale|userScalable|user-scalable=no/);
  expect(layout).toMatch(/dir=\{result\.data === "ar" \? "rtl" : "ltr"\}/);
  expect(css).toMatch(/\.school-shell[^\{]*\{[^}]*block-size:\s*100vh;\s*block-size:\s*100dvh;/);
  expect(css).toMatch(/env\(safe-area-inset-top\)/);
  expect(css).toMatch(/env\(safe-area-inset-bottom\)/);
  expect(css).toMatch(/env\(safe-area-inset-left\)/);
  expect(css).toMatch(/env\(safe-area-inset-right\)/);
  expect(css).toMatch(/min-inline-size:\s*44px;\s*min-block-size:\s*44px/);
  for(const contract of ["Scaffold(","WindowInsets.safeDrawing","NavigationBar(","NavigationBarItem(","ModalBottomSheet(","imePadding()","BackHandler("]){
    expect(android,"Android Compose contract: "+contract).toContain(contract);
  }
});

for(const scene of [
  {actor:"teacher",persona:"teacher",locale:"de",route:"attendance",width:320},
  {actor:"guardian-ar",persona:"guardian",locale:"ar",route:"home",width:390},
  {actor:"admin",persona:"admin",locale:"de",route:"students",width:430},
] as const){
  test(scene.persona+" "+scene.locale+" at "+scene.width+" preserves viewport, touch navigation, RTL/LTR and reduced motion",async({page,context})=>{
    const school=schoolFixtures();
    try{
      await school.seed();
      const token=await school.bearer(scene.actor,scene.persona);
      await context.addCookies([{name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
      await page.setViewportSize({width:scene.width,height:844});
      await page.goto("/"+scene.locale+"/school/"+scene.route);
      const shell=page.locator(".school-shell");
      const nav=page.locator(".school-nav > a");
      await expect(shell).toBeVisible({timeout:30000});
      await expect(nav).toHaveCount(4);
      const meta=await page.locator('meta[name="viewport"]').getAttribute("content");
      expect(meta).toContain("viewport-fit=cover");
      expect(meta).not.toMatch(/user-scalable=no|maximum-scale=1/);
      await expect(page.locator("html")).toHaveAttribute("dir",scene.locale==="ar"?"rtl":"ltr");
      const size=await shell.evaluate(el=>el.getBoundingClientRect().height);
      expect(size).toBeGreaterThanOrEqual(830);
      expect(size).toBeLessThanOrEqual(850);
      for(const target of await nav.all()){
        const bounds=await target.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.height).toBeGreaterThanOrEqual(44);
        expect(bounds!.width).toBeGreaterThanOrEqual(44);
      }
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      await page.emulateMedia({reducedMotion:"reduce",colorScheme:"dark"});
      const motion=await nav.first().evaluate(el=>getComputedStyle(el).transitionDuration.split(",").map(s=>s.trim()));
      expect(motion.every(s=>s==="0s")).toBe(true);
      mkdirSync("qa-artifacts/ui-after",{recursive:true});
      await page.screenshot({path:"qa-artifacts/ui-after/UIX16-"+scene.persona+"-"+scene.locale+"-"+scene.route+"-"+scene.width+"-dark-reduced.png",animations:"disabled"});
    }finally{await school.close();}
  });
}
