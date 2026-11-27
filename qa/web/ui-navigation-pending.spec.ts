import { expect, test } from "@playwright/test";
import { schoolFixtures } from "../fixtures/school";
import { localOrigin } from "../support/target";

test("school navigation shows feedback while the next page is still loading", async ({ page, context }) => {
  const school = schoolFixtures();
  let requestStarted = false;
  const releaseResponse = Promise.withResolvers<void>();
  try {
    await school.seed();
    const token = await school.bearer("teacher", "teacher");
    await context.addCookies([{ name: "madrasty-session", value: token, url: localOrigin, httpOnly: true, sameSite: "Lax" }]);

    await page.route(/\/ar\/school\/messages(?:\?|$)/, async (route) => {
      requestStarted = true;
      await releaseResponse.promise;
      await route.continue();
    });

    await page.goto("/ar/school/home");
    await expect(page.locator("main h1").first()).toContainText("مرحبًا");
    const messages = page.locator('.school-nav > a[href*="/school/messages"]');
    const click = messages.click({ timeout: 10_000 });
    // Observe the withheld request before awaiting the click, which may await navigation in WebKit.
    void click.catch(() => undefined);
    await expect.poll(() => requestStarted, {timeout: 10_000, message:"messages route requested"}).toBe(true);
    await expect.poll(async () => await messages.locator(".school-link-pending").isVisible() ||
      await page.locator(".school-route-loading").isVisible(), { timeout: 5_000 }).toBe(true);
    await expect(page.locator('.school-nav > a[href*="/school/more"]')).toBeEnabled();

    releaseResponse.resolve();
    await click;
    await expect(page.locator("main h1").first()).toHaveText("التواصل");
    await expect(messages).toHaveAttribute("aria-current", "page");
    await expect(messages.locator(".school-link-pending")).toHaveCount(0);
  } finally {
    releaseResponse.resolve();
    await school.close();
  }
});
