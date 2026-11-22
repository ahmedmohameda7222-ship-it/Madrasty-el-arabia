import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { schoolFixtures } from "../fixtures/school";
import { localOrigin } from "../support/target";

for (const scenario of [
  { actor:"guardian-de", persona:"guardian", locale:"de", path:"homework", expected:"Für dieses Kind sind derzeit keine Hausaufgaben eingetragen." },
  { actor:"guardian-ar", persona:"guardian", locale:"ar", path:"exams", expected:"لا توجد امتحانات مسجلة لهذا الطفل حاليًا." },
  { actor:"teacher", persona:"teacher", locale:"de", path:"evaluations", expected:"Für Sie sind derzeit keine Klassen zur Beurteilung verfügbar." },
  { actor:"admin", persona:"admin", locale:"ar", path:"exams", expected:"لا توجد فصول أو مواد متاحة لعرض الامتحانات حاليًا." },
] as const) {
  test(scenario.persona + " " + scenario.locale + " " + scenario.path + " explains missing academic records without unauthorized action", async ({page,context}) => {
    const school=schoolFixtures();
    try {
      await school.seed();
      const token=await school.bearer(scenario.actor,scenario.persona);
      await context.addCookies([{name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
      await page.route("**/*",route=>new URL(route.request().url()).origin===localOrigin?route.continue():route.abort());
      await page.setViewportSize({width:390,height:844});
      await page.goto("/"+scenario.locale+"/school/more/"+scenario.path);
      const message=page.locator(".school-content [data-async-state='empty']").filter({hasText:scenario.expected}).first();
      await expect(message).toBeVisible({timeout:30_000});
      await expect(message).toHaveAttribute("role","status");
      await expect(message.locator("a,button")).toHaveCount(0);
      await expect(page.locator("html")).toHaveAttribute("dir",scenario.locale==="ar"?"rtl":"ltr");
      mkdirSync("qa-artifacts/ui-after",{recursive:true});
      await page.screenshot({path:"qa-artifacts/ui-after/UIX08-"+scenario.persona+"-"+scenario.locale+"-"+scenario.path+"-390-empty.png",animations:"disabled"});
    } finally { await school.close(); }
  });
}
