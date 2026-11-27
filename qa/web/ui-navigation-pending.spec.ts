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
    await expect(page.locator("main h1").first()).toContainText("مرحبًا");
    await page.route(/\/ar\/school\/messages(?:\?|$)/, async (route) => {
      requestStarted.resolve();
      await releaseResponse.promise;
      await route.continue();
    });

    const messages = page.locator('.school-nav > a[href*="/school/messages"]');
    await messages.click();
    await requestStarted.promise;
    await expect.poll(async () => await messages.locator(".school-link-pending").isVisible() ||
      await page.locator(".school-route-loading").isVisible(), { timeout: 5_000 }).toBe(true);
    await expect(page.locator('.school-nav > a[href*="/school/more"]')).toBeEnabled();

    releaseResponse.resolve();
    await expect(page.locator("main h1").first()).toHaveText("التواصل");
    await expect(messages).toHaveAttribute("aria-current", "page");
    await expect(messages.locator(".school-link-pending")).toHaveCount(0);
  } finally {
    releaseResponse.resolve();
    await school.close();
  }
});
