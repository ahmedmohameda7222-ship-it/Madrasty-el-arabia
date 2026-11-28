import { devices, expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { visualNavigationProbe } from "../support/visual-navigation-probe";

const before = process.env.VISUAL_POLISH_BASELINE === "1";
const scenarios = [
  { locale: "de", width: 390, scheme: "light", login: "Anmelden", install: "App installieren", show: "Anzeigen", hide: "Verbergen" },
  { locale: "ar", width: 320, scheme: "dark", login: "تسجيل الدخول", install: "تثبيت مدرستي العربية", show: "إظهار", hide: "إخفاء" },
] as const;

for (const scene of scenarios) {
  test(`public entry ${scene.locale} at ${scene.width}px`, async ({ browser, baseURL }) => {
    const { defaultBrowserType: _, ...phone } = devices["iPhone 13"];
    const context = await browser.newContext({
      ...phone,
      viewport: { width: scene.width, height: 844 },
      colorScheme: scene.scheme,
      baseURL,
    });
    const folder = `qa-artifacts/visual-polish/P03/${scene.locale}-${scene.width}-${browser.browserType().name()}/${before ? "before" : "after"}`;
    mkdirSync(folder, { recursive: true });
    const page = await context.newPage();
    const probe = await visualNavigationProbe(page, `entry-${scene.locale}`);
    let installProbe: Awaited<ReturnType<typeof visualNavigationProbe>> | undefined;
    try {
      const capture = async (state: string, target = page) => {
        await target.evaluate(() => document.fonts.ready.then(() => undefined));
        expect(await target.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
        await target.screenshot({ path: `${folder}/${state}.png` });
      };
      const response = await page.goto(`/${scene.locale}`);
      expect(response?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("dir", scene.locale === "ar" ? "rtl" : "ltr");
      await capture("welcome");
      const signIn = page.getByRole("link", { name: scene.login, exact: true });
      const panel = await signIn.evaluate(element => ({
        borderRadius: parseFloat(getComputedStyle(element.parentElement!).borderRadius),
        target: element.getAttribute("href"),
      }));
      expect(panel.target).toBe(`/${scene.locale}/account/sign-in`);
      const install = page.getByRole("link", { name: scene.install, exact: true });
      await expect(install).toHaveAttribute("href", `/${scene.locale}/install`);
      probe.mark("sign-in-click");
      await signIn.click();
      await expect(page).toHaveURL(new RegExp(`/${scene.locale}/account/sign-in$`));
      const form = page.locator("form.auth-form");
      await expect(form).toHaveAttribute("aria-busy", "false");
      await capture("sign-in");
      const email = form.locator('input[name="email"]');
      const password = form.locator('input[name="password"]');
      await expect(email).toHaveAttribute("autocomplete", "username");
      await expect(password).toHaveAttribute("autocomplete", "current-password");
      await expect(password).toHaveAttribute("dir", "ltr");
      await password.fill("synthetic-visual-fixture");
      await form.getByRole("button", { name: scene.show }).click();
      await expect(password).toHaveAttribute("type", "text");
      await form.getByRole("button", { name: scene.hide }).click();
      await expect(password).toHaveAttribute("type", "password");
      const installPage = await context.newPage();
      installProbe = await visualNavigationProbe(installPage, `install-${scene.locale}`);
      installProbe.mark("landing-goto");
      await installPage.goto("/" + scene.locale);
      installProbe.mark("install-click");
      await installPage.getByRole("link", { name: scene.install, exact: true }).click();
      await expect(installPage).toHaveURL(new RegExp(`/${scene.locale}/install$`));
      await expect(installPage.getByRole("heading", { name: "iPhone", exact: true })).toBeVisible();
      await expect(installPage.getByRole("heading", { name: "Android", exact: true })).toBeVisible();
      await capture("install", installPage);
      if (!before) expect(panel.borderRadius).toBeGreaterThanOrEqual(28);
    } catch (error) {
      probe.dump();
      installProbe?.dump();
      throw error;
    } finally { await context.close(); }
  });
}

test("public and offline surfaces follow the neutral dark appearance", async ({ page, browser }) => {
  test.skip(before, "The pinned baseline precedes the current appearance direction");
  const folder = `qa-artifacts/visual-polish/P03/dark-appearance/${browser.browserType().name()}`;
  mkdirSync(folder, { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  for (const locale of ["ar", "de"]) {
    expect((await page.goto("/" + locale))?.status()).toBe(200);
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(0, 0, 0)");
    await expect(page.locator(".entry-landing")).toHaveCSS("background-color", "rgb(28, 28, 28)");
    await expect(page.locator(".entry-landing h1")).toHaveCSS("color", "rgb(255, 255, 255)");
    await expect(page.locator('meta[name="theme-color"][media="(prefers-color-scheme: dark)"]')).toHaveAttribute("content", "#000000");
    await page.screenshot({ path: folder + "/welcome-" + locale + ".png" });
    expect((await page.goto("/" + locale + "/account/sign-in"))?.status()).toBe(200);
    await expect(page.locator(".auth-card")).toHaveCSS("background-color", "rgb(28, 28, 28)");
    await page.screenshot({ path: folder + "/sign-in-" + locale + ".png" });
  }
  expect((await page.goto("/offline/attendance.html"))?.status()).toBe(200);
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(0, 0, 0)");
  await expect(page.locator("body")).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(page.locator("header")).toHaveCSS("background-color", "rgb(28, 28, 28)");
  await page.screenshot({ path: folder + "/attendance-offline.png" });
});
