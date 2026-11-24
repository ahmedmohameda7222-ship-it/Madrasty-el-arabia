import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { schoolFixtures } from "../fixtures/school";
import { localOrigin } from "../support/target";

const scenarios = [
  { actor: "admin", persona: "admin", locale: "de" },
  { actor: "admin", persona: "admin", locale: "ar" },
  { actor: "guardian-de", persona: "guardian", locale: "de" },
  { actor: "guardian-ar", persona: "guardian", locale: "ar" },
] as const;
for (const scenario of scenarios) {
  test("Finance mobile screenshot matrix " + scenario.actor + " " + scenario.locale, async ({page, context}) => {
    test.setTimeout(240_000);
    const school = schoolFixtures();
    try {
      await school.seed();
      const token = await school.bearer(scenario.actor, scenario.persona);
      await context.addCookies([{name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
      mkdirSync("qa-artifacts/ui-after", {recursive:true});
      const routes = scenario.persona === "admin"
        ? ["finance-reports","invoices","receipts","receipts?view=cashbook","record-payment","issue-invoices","fee-settings"]
        : ["finance-reports","invoices"];
      for (const route of routes) {
        for (const [width,theme] of [[390,"light"],[320,"dark"],[430,"light"],[1280,"light"]] as const) {
          await page.setViewportSize({width,height:844});
          await page.emulateMedia({colorScheme:theme,reducedMotion:"reduce"});
          const response=await page.goto("/"+scenario.locale+"/school/more/"+route);
          expect(response?.status()).toBe(200);
          await expect(page.locator(".school-content h1").first()).toBeVisible();
          await expect(page.locator('.school-content [data-async-state="loading"]')).toHaveCount(0);
          expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);
          const file=route.replace(/[^a-z0-9-]/g,"-");
          await page.screenshot({path:"qa-artifacts/ui-after/finance-"+scenario.actor+"-"+scenario.locale+"-"+file+"-"+width+"-"+theme+".png",animations:"disabled",fullPage:true});
        }
      }
    } finally { await school.close(); }
  });
}
