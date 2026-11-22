import { expect, test } from "@playwright/test";
import { schoolFixtures } from "../fixtures/school";
import { localOrigin } from "../support/target";

test("Arabic More pages return to the menu from a link or direct visit", async ({ page, context }) => {
  const school = schoolFixtures();
  try {
    await school.seed();
    const token = await school.bearer("admin", "admin");
    await context.addCookies([{ name: "madrasty-session", value: token, url: localOrigin, httpOnly: true, sameSite: "Lax" }]);
    await page.setViewportSize({ width: 390, height: 844 });

    const back = page.getByRole("link", { name: "رجوع للمزيد", exact: true });
    await page.goto("/ar/school/more");
    await expect(back).toHaveCount(0);
    await page.locator("summary").getByText("التعليم والحضور", { exact: true }).click();
    await page.getByRole("link", { name: "تصحيح الواجبات", exact: true }).click();
    await expect(page.getByRole("heading", { name: "تصحيح الواجبات", exact: true })).toBeVisible();
    await expect(back).toBeVisible();
    await back.press("Enter");
    await expect(page).toHaveURL("/ar/school/more");
    await expect(page.locator("details").filter({hasText:"التعليم والحضور"})).toHaveAttribute("open","");

    for (const route of ["/ar/school/more/calendar", "/ar/staff/access", "/ar/account/security", "/ar/account/preferences"]) {
      await page.goto(route);
      await expect(back).toHaveAttribute("href", "/ar/school/more");
      await back.click();
      await expect(page).toHaveURL("/ar/school/more");
    }
  } finally {
    await school.close();
  }
});

test("German More navigation works on mobile", async ({ page, context }) => {
  const school = schoolFixtures();
  try {
    await school.seed();
    const token = await school.bearer("guardian-de", "guardian");
    await context.addCookies([{ name: "madrasty-session", value: token, url: localOrigin, httpOnly: true, sameSite: "Lax" }]);
    await page.setViewportSize({ width: 320, height: 844 });

    const back = page.getByRole("link", { name: "Zurück zu „Mehr“", exact: true });
    await page.goto("/de/directory");
    await expect(back).toBeVisible();
    expect((await back.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await back.click();
    await expect(page).toHaveURL("/de/school/more");

  } finally {
    await school.close();
  }
});
