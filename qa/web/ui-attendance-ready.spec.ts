import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { schoolFixtures } from "../fixtures/school";
import { localOrigin } from "../support/target";

const widths = [320, 390, 430, 768, 1024, 1280] as const;

test("UIX17 teacher attendance is READY in Arabic and German with a real synthetic school calendar", async ({page, context}, testInfo) => {
  const school = schoolFixtures();
  const captures: {sha:string;role:string;locale:string;route:string;width:number;state:string;path:string}[] = [];
  try {
    await school.seed();
    const token = await school.bearer("teacher", "teacher");
    await context.addCookies([{name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
    mkdirSync("qa-artifacts/ui-after",{recursive:true});
    mkdirSync("qa-artifacts/ui-manifests",{recursive:true});
    for(const locale of ["ar","de"] as const){
      const route = `/${locale}/school/attendance`;
      const classLabel = locale==="ar" ? "اختر الفصل" : "Klasse auswählen";
      const openLabel = locale==="ar" ? "افتح كشف الحضور" : "Anwesenheitsliste öffnen";
      for(const width of widths){
        await page.setViewportSize({width,height:844});
        const classesResponse=page.waitForResponse(r => new URL(r.url()).pathname==="/api/v1/attendance/classes");
        const documentResponse=await page.goto(route);
        expect(documentResponse?.status()).toBe(200);
        const apiResponse=await classesResponse;
        expect(apiResponse.status(), `${locale} ${width}px must fetch a configured attendance catalogue`).toBe(200);
        await expect(page).toHaveURL(new RegExp(`${route}$`));
        const main=page.locator(".school-content");
        await expect(main).toBeVisible();
        await expect(main.locator('[data-async-state="loading"]')).toHaveCount(0,{timeout:30000});
        await expect(main.locator('[data-async-state="error"],[data-async-state="forbidden"]')).toHaveCount(0);
        const classes=main.getByRole("combobox",{name:classLabel});
        await expect(classes).toBeVisible();
        await expect.poll(()=>classes.locator("option").count()).toBeGreaterThan(1);
        await classes.selectOption({index:1});
        await expect(main.getByRole("button",{name:openLabel})).toBeVisible();
        const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
        expect(overflow, `${locale} ${width}px attendance horizontal overflow`).toBeLessThanOrEqual(1);
        const path=`qa-artifacts/ui-after/UIX17-teacher-${locale}-attendance-ready-${width}.png`;
        await page.screenshot({path,animations:"disabled"});
        expect(existsSync(path)).toBe(true);
        expect(statSync(path).size).toBeGreaterThan(0);
        captures.push({sha:process.env.GITHUB_SHA??"local",role:"teacher",locale,route,width,state:"ready-configured-school-calendar",path});
      }
    }
    expect(captures).toHaveLength(12);
    writeFileSync("qa-artifacts/ui-manifests/UIX17-teacher-attendance-ready.json",JSON.stringify({
      head:process.env.GITHUB_SHA??"local",browser:testInfo.project.name,scenes:captures
    },null,2)+"\n");
  }finally{await school.close();}
});
