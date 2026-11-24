import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { schoolFixtures } from "../fixtures/school";
import { localOrigin } from "../support/target";

for(const scenario of [
  {actor:"admin",persona:"admin",locale:"ar",path:"more/finance-reports",dates:3,months:1},
  {actor:"teacher",persona:"teacher",locale:"de",path:"attendance",dates:1,months:0},
  {actor:"guardian-de",persona:"guardian",locale:"de",path:"more/reports",dates:2,months:0},
] as const) {
  test(scenario.locale+" "+scenario.path+" labels browser-native date order without changing ISO field values",async({page,context})=>{
    const school=schoolFixtures();
    try {
      await school.seed();
      const token=await school.bearer(scenario.actor,scenario.persona);
      await context.addCookies([{name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
      await page.setViewportSize({width:390,height:844});
      await page.goto("/"+scenario.locale+"/school/"+scenario.path);
      if(scenario.path==="more/finance-reports")await page.getByText("تصفية التقرير",{exact:true}).click();
      const dateFields=page.locator(".school-content input[type='date']");
      const monthFields=page.locator(".school-content input[type='month']");
      await expect(dateFields).toHaveCount(scenario.dates);
      await expect(monthFields).toHaveCount(scenario.months);
      const expectedHint=scenario.locale==="ar"
        ?"تنسيق التاريخ المعروض يعتمد على المتصفح"
        :"Das angezeigte Datumsformat hängt vom Browser ab";
      for(const field of await dateFields.all()){
        await expect(field).toBeVisible();
        const id=await field.getAttribute("aria-describedby");
        expect(id,"date field must expose a human-readable value or format hint").toMatch(scenario.path==="more/finance-reports"?/^finance-date-/:/^date-format-/);
        const hint=page.locator("#"+id);
        await expect(hint).toBeVisible();
        if(scenario.path!=="more/finance-reports")await expect(hint).toContainText(expectedHint);else await expect(hint).not.toBeEmpty();
      }
      for(const field of await monthFields.all()){
        await expect(field).toBeVisible();
        const id=await field.getAttribute("aria-describedby");
        expect(id,"month field must expose readable date context").toMatch(/^finance-date-/);
        await expect(page.locator("#"+id)).not.toBeEmpty();
      }
      const first=dateFields.first();
      await first.fill("2026-11-20");
      await expect(first).toHaveValue("2026-11-20");
      const stable=await first.evaluate(el=>(el as HTMLInputElement).value);
      expect(stable,"native date value must stay unshifted ISO").toBe("2026-11-20");
      mkdirSync("qa-artifacts/ui-after",{recursive:true});
      await page.screenshot({path:"qa-artifacts/ui-after/UIX12-"+scenario.persona+"-"+scenario.locale+"-"+scenario.path.replaceAll("/","-")+"-390-date-hints.png",animations:"disabled"});
    }finally{await school.close();}
  });
}
