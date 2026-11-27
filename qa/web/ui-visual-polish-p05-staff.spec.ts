import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { schoolFixtures } from "../fixtures/school";
import { localOrigin } from "../support/target";

for (const scene of [
  { locale: "de", width: 390, theme: "light", title: "Lehrkräfte und Verwaltung", add: "Lehrkraft hinzufügen", cancel: "Abbrechen", save: "Konto erstellen" },
  { locale: "ar", width: 320, theme: "dark", title: "المدرسون والإدارة", add: "إضافة مدرس", cancel: "إلغاء", save: "إنشاء الحساب" },
] as const) {
  test(`P05 staff workspace and direct provision geometry ${scene.locale}`, async ({ page, context, browser }) => {
    const school = schoolFixtures();
    const folder = `qa-artifacts/visual-polish/P05/staff-${scene.locale}-${scene.width}/${browser.browserType().name()}`;
    mkdirSync(folder, { recursive: true });
    await context.tracing.start({ screenshots: true, snapshots: true });
    try {
      await school.seed();
      const token = await school.bearer("admin", "admin");
      await context.addCookies([{ name: "madrasty-session", value: token, url: localOrigin, httpOnly: true, sameSite: "Lax" }]);
      await page.setViewportSize({ width: scene.width, height: 844 });
      await page.emulateMedia({ colorScheme: scene.theme, reducedMotion: "reduce" });
      const base = `/${scene.locale}/school/more/assignments`;
      expect((await page.goto(base))?.status()).toBe(200);
      const heading = page.getByRole("heading", { name: scene.title, exact: true });
      const add = page.getByRole("button", { name: scene.add, exact: true });
      await expect(heading).toBeVisible();
      await expect(page.locator("main button[aria-pressed]").first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const spacing = await heading.evaluate(el => getComputedStyle(el).letterSpacing);
      await page.screenshot({ path: folder + "/directory.png" });
      await add.click();
      const form = page.getByRole("region", { name: scene.add, exact: true });
      await expect(form).toBeVisible();
      const cancel = form.getByRole("button", { name: scene.cancel, exact: true }).first();
      const save = form.getByRole("button", { name: scene.save, exact: true });
      await expect(cancel).toBeVisible();
      await expect(save).toBeVisible();
      const geometry = await form.evaluate(el => {
        const cancel = el.querySelector("div button")!;
        const save = el.querySelector("form button:not([type])")!;
        return {
          cancelHeight: cancel.getBoundingClientRect().height,
          primaryHeight: save.getBoundingClientRect().height,
          primaryRadius: parseFloat(getComputedStyle(save).borderTopLeftRadius),
          cardRadius: parseFloat(getComputedStyle(el).borderTopLeftRadius),
        };
      });
      const colors = await save.evaluate(el => {
        const probe = document.createElement("span");
        probe.style.backgroundColor = "var(--primary)";
        probe.style.color = "var(--on-primary)";
        el.append(probe);
        const expected = getComputedStyle(probe);
        const actual = getComputedStyle(el);
        const result = { actual: actual.backgroundColor, expected: expected.backgroundColor, ink: actual.color, expectedInk: expected.color };
        probe.remove();
        return result;
      });
      await page.screenshot({ path: folder + "/provision.png" });
      expect(await page.locator(".school-content").evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
      await cancel.click();
      await expect(form).toHaveCount(0);
      await expect(add).toBeVisible();
      await expect(page).toHaveURL(new RegExp("/school/more/assignments$"));
      writeFileSync(folder + "/geometry.json", JSON.stringify({ geometry, colors, spacing }, null, 2));
      console.log("P05 staff geometry", JSON.stringify({ locale: scene.locale, geometry, colors, spacing }));
      expect(geometry.cancelHeight).toBeGreaterThanOrEqual(44);
      expect(geometry.primaryHeight).toBeGreaterThanOrEqual(48);
      expect(geometry.primaryRadius).toBeGreaterThanOrEqual(geometry.primaryHeight / 2);
      expect(geometry.cardRadius).toBeGreaterThanOrEqual(22);
      expect(colors.actual).toBe(colors.expected);
      expect(colors.ink).toBe(colors.expectedInk);
      if (scene.locale === "ar") expect(["normal", "0px"]).toContain(spacing);
    } finally {
      await context.tracing.stop({ path: folder + "/trace.zip" });
      await school.close();
    }
  });
}
