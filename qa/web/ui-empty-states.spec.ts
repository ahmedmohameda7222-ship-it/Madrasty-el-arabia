import { expect, test } from "@playwright/test";
import { schoolFixtures } from "../fixtures/school";
import { localOrigin } from "../support/target";

test("genuinely empty academic records announce a distinct, role-safe state in Arabic and German", async ({page,context}) => {
  const school=schoolFixtures();
  try {
    await school.seed();
    const token=await school.bearer("guardian-de","guardian");
    await context.addCookies([{name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
    await page.route("**/*",route=>new URL(route.request().url()).origin===localOrigin?route.continue():route.abort());
    for(const locale of ["de","ar"]) {
      await page.goto("/"+locale+"/school/more/homework");
      const message=locale==="de"?"Es gibt noch keine Einträge":"لا توجد سجلات بعد";
      const empty=page.locator(".school-content .notice").filter({hasText:message}).first();
      await expect(empty).toBeVisible({timeout:25_000});
      await expect(empty).toHaveAttribute("data-async-state","empty");
      await expect(empty).toHaveAttribute("role","status");
      await expect(empty.locator("button, a")).toHaveCount(0);
      await expect(page.locator("html")).toHaveAttribute("dir",locale==="ar"?"rtl":"ltr");
    }
  } finally {await school.close();}
});

test("transient academic HTTP failure stays an error with a retry, not a successful empty screen", async({page,context})=>{
  const school=schoolFixtures();
  try{
    await school.seed();
    const token=await school.bearer("guardian-de","guardian");
    await context.addCookies([{name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
    await page.route("**/api/v1/academics/homework?*",async route=>
      route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:{code:"unavailable"}})}));
    await page.goto("/de/school/more/homework");
    const error=page.locator(".school-content .notice:has([role='alert'])").first();
    await expect(error).toBeVisible({timeout:25_000});
    await expect(error).toHaveAttribute("data-async-state","error");
    await expect(error.locator("button")).toHaveCount(1);
    await expect(error.locator("[role='alert']")).not.toBeEmpty();
  } finally {await school.close();}
});
