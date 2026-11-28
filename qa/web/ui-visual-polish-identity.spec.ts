import { devices, expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { visualNavigationProbe } from "../support/visual-navigation-probe";

const before = process.env.VISUAL_POLISH_BASELINE === "1";

for (const locale of ["ar", "de"] as const) {
  test(`public identity form and terminal states ${locale}`, async ({ browser, baseURL }) => {
    const { defaultBrowserType: _, ...phone } = devices["iPhone 13"];
    const context = await browser.newContext({
      ...phone, viewport: { width: 390, height: 844 }, colorScheme: locale === "ar" ? "dark" : "light", baseURL,
    });
    const page = await context.newPage();
    const probe = await visualNavigationProbe(page, `public-identity-${locale}`);
    const folder = `qa-artifacts/visual-polish/P03/identity-${locale}-${browser.browserType().name()}/${before ? "before" : "after"}`;
    mkdirSync(folder, { recursive: true });
    try {
      const states = ["invite", "account/security/recover", "account/security/email", "account/security/activate"];
      const cards: string[] = [];
      for (const path of states) {
        probe.mark("goto-" + path);
        const response = await page.goto(`/${locale}/${path}`);
        expect(response?.status()).toBe(200);
        const card = page.locator("main .auth-card");
        await expect(card.getByRole("heading", { level: 1 })).toBeVisible();
        if (path === "invite") await expect(card.locator('a[href$="/account/sign-in"]')).toBeVisible();
        else if (path === "account/security/recover") {
          await expect(card.locator('input[type="email"]')).toHaveAttribute("autocomplete", "email");
          await expect(card.locator('form button[type="submit"], form button:not([type])')).toBeEnabled();
        } else {
          await expect(card.getByRole("alert")).toBeVisible();
          await expect(card.locator("form")).toHaveCount(0);
        }
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
        cards.push(await card.evaluate(element => getComputedStyle(element).boxShadow));
        await page.screenshot({ path: `${folder}/${path.split("/").at(-1)}.png` });
      }
      if (!before) for (const shadow of cards) expect(shadow).not.toBe("none");
    } catch (error) { probe.dump(); throw error; }
    finally { await context.close(); }
  });
}

test("guardian settings and profile retain controls and staff access stays restricted", async ({ page, context, baseURL }) => {
  const { schoolFixtures } = await import("../fixtures/school");
  const { localOrigin, fixtureEmail } = await import("../support/target");
  const school = schoolFixtures();
  const probe = await visualNavigationProbe(page, "guardian-de-identity");
  const folder = `qa-artifacts/visual-polish/P03/guardian-de-settings/${before ? "before" : "after"}`;
  mkdirSync(folder, { recursive: true });
  try {
    await school.seed();
    if (baseURL === "https://127.0.0.1:4443") {
      // Production-mode evidence must use the existing sign-in and its real
      // host-only secure cookies. No disabling TLS verification or cookie policy.
      const login = await context.request.post(baseURL + "/api/v1/auth/sign-in", {
        headers: { Origin: baseURL },
        data: { email: fixtureEmail(school.run, "guardian-de"), password: school.password },
      });
      expect(login.status(), "production fixture web sign-in").toBe(200);
      const cookies = await context.cookies(baseURL);
      expect(cookies.some(cookie => cookie.name === "__Host-madrasty-session" && cookie.secure && cookie.httpOnly && cookie.path === "/")).toBe(true);
      expect(cookies.some(cookie => cookie.name === "__Host-madrasty-csrf" && cookie.secure && !cookie.httpOnly && cookie.path === "/")).toBe(true);
    } else {
      expect(baseURL).toBe(localOrigin);
      const token = await school.bearer("guardian-de", "guardian");
      await context.addCookies([{ name: "madrasty-session", value: token, url: localOrigin, httpOnly: true, sameSite: "Lax" }]);
    }
    await page.setViewportSize({ width: 320, height: 844 });
    probe.mark("preferences-goto");
    await page.goto("/de/account/preferences");
    await expect(page).toHaveURL(baseURL + "/de/account/preferences");
    const theme = page.locator("select").filter({ has: page.locator('option[value="dark"]') });
    await expect(theme).toBeVisible();
    await expect(theme.locator("option")).toHaveCount(3);
    await page.screenshot({ path: `${folder}/preferences.png` });
    await theme.selectOption("dark");
    await expect(theme).toHaveValue("dark");
    probe.mark("profile-goto");
    await page.goto("/de/account/profile");
    await expect(page).toHaveURL(baseURL + "/de/account/profile");
    await expect(page.locator('input[name="phone"]')).toHaveAttribute("type", "tel");
    await expect(page.locator('textarea[name="address"]')).toBeVisible();
    await expect(page.locator('input[name="name"]').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `${folder}/profile.png` });
    probe.mark("staff-access-goto");
    const denied = await page.goto("/de/staff/access");
    expect(denied?.status()).toBe(404);
    await expect(page.locator(".auth-card")).toHaveCount(0);
    await page.screenshot({ path: `${folder}/restricted-access.png` });
  } catch (error) { probe.dump(); throw error; }
  finally { await school.close(); }
});
