import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { schoolFixtures } from "../fixtures/school";
import { localOrigin } from "../support/target";

test("linked guardian child is explicit on first visit and switch updates the summary",async({page,context})=>{
  const school=schoolFixtures();
  try {
    await school.seed();
    const token=await school.bearer("guardian-ar","guardian");
    await context.addCookies([{name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
    await page.setViewportSize({width:390,height:844});
    await page.goto("/ar/school/children");
    const heading=page.locator(".school-content .auth-card h2 bdi").first();
    await expect(heading).toBeVisible({timeout:30_000});
    expect([...(await heading.textContent()??"")].length).toBeGreaterThan(2);
    await expect(page.locator(".school-content .auth-card p").filter({hasText:"رقم الطالب"})).toBeVisible();
    mkdirSync("qa-artifacts/ui-after",{recursive:true});
    await page.screenshot({path:"qa-artifacts/ui-after/UIX09-guardian-ar-children-390-initial.png",animations:"disabled"});
    const trigger=page.locator(".school-content .auth-card button.plain-button").first();
    await trigger.click();
    const row=page.locator(".scope-sheet .group-row").filter({hasText:"نور"});
    await expect(row).toBeVisible();
    await row.click();
    await expect(heading).toHaveText("نور");
    await expect(page.locator(".scope-sheet")).not.toBeVisible();
    await page.screenshot({path:"qa-artifacts/ui-after/UIX09-guardian-ar-children-390-switched.png",animations:"disabled"});
  } finally {await school.close();}
});

test("single linked child has context on German desktop",async({page,context})=>{
  const school=schoolFixtures();
  try {
    await school.seed();
    const token=await school.bearer("guardian-de","guardian");
    await context.addCookies([{name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
    await page.setViewportSize({width:1280,height:900});
    await page.goto("/de/school/children");
    const heading=page.locator(".school-content .auth-card h2 bdi").first();
    await expect(heading).toBeVisible({timeout:30_000});
    expect([...(await heading.textContent()??"")].length).toBeGreaterThan(80);
    await expect(page.locator(".school-content .auth-card p").filter({hasText:"Schülernummer"})).toBeVisible();
    mkdirSync("qa-artifacts/ui-after",{recursive:true});
    await page.screenshot({path:"qa-artifacts/ui-after/UIX09-guardian-de-children-1280-initial.png",animations:"disabled"});
  } finally {await school.close();}
});

test("unlinked guardian receives an explanation and no create-child permission",async({page,context})=>{
  const school=schoolFixtures();
  try {
    await school.seed();
    const token=await school.bearer("guardian-de","guardian");
    await context.addCookies([{name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
    await page.route("**/api/v1/me/children?*",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:[]})}));
    await page.setViewportSize({width:320,height:700});
    await page.goto("/de/school/children");
    const empty=page.locator(".school-content [data-async-state='empty']");
    await expect(empty).toContainText("Mit Ihrem Konto sind derzeit keine Kinder verknüpft.",{timeout:30_000});
    await expect(empty.locator("button,a")).toHaveCount(0);
    await expect(page.locator(".school-content h2 bdi")).toHaveCount(0);
    mkdirSync("qa-artifacts/ui-after",{recursive:true});
    await page.screenshot({path:"qa-artifacts/ui-after/UIX09-guardian-de-children-320-empty.png",animations:"disabled"});
  } finally {await school.close();}
});

test("invalid child deep link does not show another child's protected details",async({page,context})=>{
  const school=schoolFixtures();
  try {
    await school.seed();
    const token=await school.bearer("guardian-de","guardian");
    await context.addCookies([{name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
    await page.setViewportSize({width:390,height:844});
    await page.goto("/de/school/children?child=00000000-0000-4000-8000-000000000000");
    const forbidden=page.locator(".school-content [data-async-state='forbidden']");
    await expect(forbidden).toBeVisible({timeout:30_000});
    await expect(page.locator(".school-content .auth-card h2 bdi")).toHaveCount(0);
    await expect(page.locator(".scope-sheet")).toBeAttached();
  } finally {await school.close();}
});
