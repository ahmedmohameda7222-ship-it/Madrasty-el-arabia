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
  test.describe("finance locale "+scenario.actor+" "+scenario.locale,()=>{
  test.use({locale:scenario.locale==="ar"?"ar-EG":"de-DE"});
  test("Finance mobile screenshot matrix " + scenario.actor + " " + scenario.locale, async ({page, context}) => {
    test.setTimeout(360_000);
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
          if(route==="fee-settings"){
            await expect(page.getByRole("switch",{name:scenario.locale==="ar"?"إصدار تلقائي":"Automatisch ausstellen"})).toBeVisible();
            await expect(page.locator(".school-content h1")).toHaveCount(1);
            await expect(page.getByRole("heading",{name:scenario.locale==="ar"?"الفواتير الشهرية التلقائية":"Automatische Monatsrechnungen",exact:true})).toHaveCount(1);
          }
          if(route==="invoices"&&scenario.persona==="guardian")await expect(page.locator(".school-content input[type=search]")).toHaveCount(0);
          if(route==="issue-invoices")await expect(page.getByRole("combobox",{name:scenario.locale==="ar"?"نوع الفاتورة":"Rechnungsart",exact:true})).toBeVisible();
          if(route==="finance-reports"&&scenario.persona==="admin"){
            await page.getByText(scenario.locale==="ar"?"تصفية التقرير":"Bericht filtern",{exact:true}).click();
          }
          if(["issue-invoices","record-payment","fee-settings","receipts?view=cashbook"].includes(route)||(route==="finance-reports"&&scenario.persona==="admin")){
            const fields=page.locator('.school-content input:is([type=date],[type=month]):visible');
            expect(await fields.count()).toBeGreaterThan(0);
            for(const field of await fields.all()){
              const hintId=await field.getAttribute("aria-describedby");
              expect(hintId).toMatch(/^finance-date-/);
              await expect(page.locator('[id="'+hintId+'"]')).toBeVisible();
              await expect(field).toHaveAttribute("lang",scenario.locale==="ar"?"ar-EG":"de-DE");
              const fit=await field.evaluate(el=>{
                const box=el.getBoundingClientRect(),label=el.closest("label")!.getBoundingClientRect();
                const container=el.closest(".school-content")!.getBoundingClientRect();
                return box.left>=label.left-1&&box.right<=label.right+1&&box.left>=container.left-1&&box.right<=container.right+1;
              });
              expect(fit,"native field must fit its label, not just the viewport").toBe(true);
              const visual=page.locator('[id="'+hintId+'"]');
              await expect(visual).not.toBeEmpty();
              if(await field.inputValue()==="")await expect(visual).toContainText(scenario.locale==="ar"?/اختر/:/wählen/);
              else if(scenario.locale==="de")await expect(visual).not.toContainText(/December|October|January|February/);
            }
          }
          const file=route.replace(/[^a-z0-9-]/g,"-");
          await page.screenshot({path:"qa-artifacts/ui-after/finance-"+scenario.actor+"-"+scenario.locale+"-"+file+"-"+width+"-"+theme+".png",animations:"disabled",fullPage:true});
          if(route==="fee-settings"){
            const tariff=page.getByRole("button",{name:scenario.locale==="ar"?"التعريفات":"Gebührentarife",exact:true});
            const payer=page.getByRole("button",{name:scenario.locale==="ar"?"مسؤول السداد":"Zahlungspflichtige Person",exact:true});
            for(const button of [tariff,payer]){
              await expect(button).toBeVisible();
              const fits=await button.evaluate(el=>{
                const box=el.getBoundingClientRect(),range=document.createRange();
                range.selectNodeContents(el);
                return box.height>=44&&[...range.getClientRects()].every(r=>r.left>=box.left-1&&r.right<=box.right+1&&r.top>=box.top-1&&r.bottom<=box.bottom+1);
              });
              expect(fits,"fee settings label stays inside its own touch target").toBe(true);
            }
            if(width>=320&&width<=430){
              const a=await tariff.boundingBox(),b=await payer.boundingBox();
              expect(Math.abs(a!.y-b!.y),"compact fee tabs share one row").toBeLessThanOrEqual(1);
            }
            await payer.scrollIntoViewIfNeeded();
            await expect(payer).toBeInViewport();
            await page.screenshot({path:"qa-artifacts/ui-after/finance-action-"+scenario.actor+"-"+scenario.locale+"-fee-settings-"+width+"-"+theme+".png",animations:"disabled"});
          }
          if(route==="issue-invoices"||route==="record-payment"){
            const action=page.locator(".school-content button[type=submit].primary-button").last();
            await action.scrollIntoViewIfNeeded();
            await expect(action).toBeInViewport();
            const visible=await action.evaluate(el=>{const a=el.getBoundingClientRect(),c=document.querySelector(".school-content")!.getBoundingClientRect();return a.top>=c.top-1&&a.bottom<=c.bottom+1;});
            expect(visible).toBe(true);
            await page.screenshot({path:"qa-artifacts/ui-after/finance-action-"+scenario.actor+"-"+scenario.locale+"-"+file+"-"+width+"-"+theme+".png",animations:"disabled"});
          }
        }
      }
    } finally { await school.close(); }
  });
  });
}
