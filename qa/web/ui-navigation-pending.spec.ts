import { expect, test } from "@playwright/test";
import { schoolFixtures } from "../fixtures/school";
import { localOrigin } from "../support/target";

test("school navigation shows feedback while the next page is still loading", async ({ page, context }) => {
  const school = schoolFixtures();
  const requestStarted = Promise.withResolvers<void>();
  const releaseResponse = Promise.withResolvers<void>();
  try {
    await school.seed();
    const token = await school.bearer("teacher", "teacher");
    await context.addCookies([{ name: "madrasty-session", value: token, url: localOrigin, httpOnly: true, sameSite: "Lax" }]);

    await page.goto("/ar/school/home");
    await expect(page.locator("h1")).toHaveText("الرئيسية");
    await page.route(/\/ar\/school\/messages(?:\?|$)/, async (route) => {
      requestStarted.resolve();
      await releaseResponse.promise;
      await route.continue();
    });

    const messages = page.getByRole("link", { name: "الرسائل", exact: true });
    await messages.click();
    await requestStarted.promise;
    await expect(messages.locator(".school-link-pending")).toBeVisible({ timeout: 1_000 });
    await expect(page.getByRole("navigation").getByRole("link", { name: "المزيد", exact: true })).toBeEnabled();
    await expect(page.locator("h1")).toHaveText("الرئيسية");

    releaseResponse.resolve();
    await expect(page.locator("h1")).toHaveText("الرسائل");
    await expect(messages).toHaveAttribute("aria-current", "page");
    await expect(messages.locator(".school-link-pending")).toHaveCount(0);
  } finally {
    releaseResponse.resolve();
    await school.close();
  }
});
