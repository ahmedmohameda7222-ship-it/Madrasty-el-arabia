import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { schoolFixtures } from "../fixtures/school";
import { fixtureEmail, localOrigin } from "../support/target";

for (const scene of [
  { locale: "de", scheme: "light", heading: "Seite nicht gefunden" },
  { locale: "ar", scheme: "dark", heading: "الصفحة غير موجودة" },
] as const) {
  test("P03 generic restricted response presentation " + scene.locale, async ({ page, context, browser, baseURL }) => {
    const school = schoolFixtures();
    const folder = `qa-artifacts/visual-polish/P03/not-found-${scene.locale}-${browser.browserType().name()}/after`;
    mkdirSync(folder, { recursive: true });
    try {
      await school.seed();
      if (baseURL === "https://127.0.0.1:4443") {
        const login = await context.request.post(baseURL + "/api/v1/auth/sign-in", {
          headers: { Origin: baseURL },
          data: { email: fixtureEmail(school.run, "guardian-de"), password: school.password },
        });
        expect(login.status()).toBe(200);
        expect((await context.cookies(baseURL)).some(c => c.name === "__Host-madrasty-session" && c.secure && c.httpOnly)).toBe(true);
      } else {
        expect(baseURL).toBe(localOrigin);
        const token = await school.bearer("guardian-de", "guardian");
        await context.addCookies([{ name: "madrasty-session", value: token, url: localOrigin, httpOnly: true, sameSite: "Lax" }]);
      }
      await page.setViewportSize({ width: 320, height: 844 });
      await page.emulateMedia({ colorScheme: scene.scheme, reducedMotion: "reduce" });
      const response = await page.goto("/" + scene.locale + "/staff/access");
      expect(response?.status()).toBe(404);
      await expect(page.locator(".auth-card, form")).toHaveCount(0);
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await page.screenshot({ path: folder + "/restricted.png" });
      await expect(page.getByRole("heading", { name: scene.heading, exact: true })).toBeVisible();
      const visual = page.locator("[data-generic-not-found]");
      await expect(visual).toBeVisible();
      await expect(visual.getByRole("heading")).toHaveCount(1);
      const measure = () => visual.evaluate(el => ({
        overflow: Math.max(document.documentElement.scrollWidth - innerWidth, el.scrollWidth - el.clientWidth),
        radius: parseFloat(getComputedStyle(el).borderTopLeftRadius),
        background: getComputedStyle(el).backgroundColor,
        expected: getComputedStyle(document.documentElement).getPropertyValue("--card").trim(),
      }));
      const normal = await measure();
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      await page.screenshot({ path: folder + "/restricted-text-200.png" });
      const large = await measure();
      for (const result of [normal, large]) {
        expect(result.overflow).toBeLessThanOrEqual(1);
        expect(result.radius).toBeGreaterThanOrEqual(16);
        expect(result.expected).not.toBe("");
      }
      await expect(page).toHaveURL(baseURL + "/" + scene.locale + "/staff/access");
    } finally { await school.close(); }
  });
}
