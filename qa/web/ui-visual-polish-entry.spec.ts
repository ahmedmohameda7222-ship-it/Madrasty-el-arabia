import { devices, expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

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
      await installPage.goto("/" + scene.locale);
      await installPage.getByRole("link", { name: scene.install, exact: true }).click();
      await expect(installPage).toHaveURL(new RegExp(`/${scene.locale}/install$`));
      await expect(installPage.getByRole("heading", { name: "iPhone", exact: true })).toBeVisible();
      await expect(installPage.getByRole("heading", { name: "Android", exact: true })).toBeVisible();
      await capture("install", installPage);
      if (!before) expect(panel.borderRadius).toBeGreaterThanOrEqual(28);
    } finally { await context.close(); }
  });
}
