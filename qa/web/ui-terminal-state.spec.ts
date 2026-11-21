import { expect, test } from "@playwright/test";
import { schoolFixtures } from "../fixtures/school";
import { localOrigin } from "../support/target";

test("pending async screen exposes a reliable loading marker for screenshot acceptance", async ({ page, context }) => {
  const school = schoolFixtures();
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  try {
    await school.seed();
    const token = await school.bearer("guardian-de", "guardian");
    await context.addCookies([{ name:"madrasty-session", value:token, url:localOrigin, httpOnly:true, sameSite:"Lax" }]);
    // Deliberately hold the isolated /me/children response, so state inspection cannot race hydration.
    await page.route("**/api/v1/me/children?*", async route => {
      await hold;
      try { await route.continue(); } catch { /* test teardown may already close page */ }
    });
    await page.goto("/de/school/home", { waitUntil:"domcontentloaded" });
    const loadingStatus = page.locator(".school-content p[role='status'].screen-reader-only").first();
    await expect(loadingStatus).toBeAttached({ timeout:20_000 });
    await expect(loadingStatus).toHaveAttribute("data-async-state", "loading");
  } finally {
    release();
    await school.close();
  }
});
