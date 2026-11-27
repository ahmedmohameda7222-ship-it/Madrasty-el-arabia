import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { schoolFixtures } from "../fixtures/school";
import { localOrigin } from "../support/target";

for (const scene of [
  { locale: "de", width: 390, theme: "light", title: "Schuljahr und Kalender", year: "Ausgewähltes Schuljahr", create: "Neues Schuljahr", next: "Nächster Monat", prev: "Vorheriger Monat", today: "Heute", cancel: "Abbrechen" },
  { locale: "ar", width: 320, theme: "dark", title: "السنة الدراسية والتقويم", year: "السنة الدراسية المختارة", create: "سنة دراسية جديدة", next: "الشهر التالي", prev: "الشهر السابق", today: "اليوم", cancel: "إلغاء" },
] as const) {
  test(`P09 school calendar hierarchy and month controls ${scene.locale}`, async ({ page, context, browser }) => {
    const school = schoolFixtures();
    const folder = `qa-artifacts/visual-polish/P09/calendar-${scene.locale}-${scene.width}/${browser.browserType().name()}`;
    mkdirSync(folder, { recursive: true });
    await context.tracing.start({ screenshots: true, snapshots: true });
    try {
      await school.seed();
      const admin = await school.bearer("admin", "admin");
      await context.addCookies([{ name: "madrasty-session", value: admin, url: localOrigin, httpOnly: true, sameSite: "Lax" }]);
      await page.setViewportSize({ width: scene.width, height: 844 });
      await page.emulateMedia({ colorScheme: scene.theme, reducedMotion: "reduce" });
      expect((await page.goto(`/${scene.locale}/school/more/calendar`))?.status()).toBe(200);
      const heading = page.getByRole("heading", { name: scene.title, exact: true });
      const calendar = page.getByRole("region", { name: scene.title, exact: true });
      const create = page.getByRole("button", { name: new RegExp(scene.create) });
      const year = page.getByText(scene.year, { exact: true }).locator("..");
      await expect(heading).toBeVisible();
      await expect(calendar).toBeVisible();
      await expect(year).toBeVisible();
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const next = calendar.getByRole("button", { name: scene.next });
      const prev = calendar.getByRole("button", { name: scene.prev });
      const month = calendar.getByRole("heading", { level: 2 }).first();
      const original = await month.innerText();
      const metrics = {
        createHeight: (await create.boundingBox())!.height,
        arrowWidth: (await next.boundingBox())!.width,
        arrowHeight: (await next.boundingBox())!.height,
        yearRadius: await year.evaluate(el => parseFloat(getComputedStyle(el).borderTopLeftRadius)),
        calendarRadius: await calendar.evaluate(el => parseFloat(getComputedStyle(el).borderTopLeftRadius)),
        titleTracking: await heading.evaluate(el => getComputedStyle(el).letterSpacing),
      };
      await page.screenshot({ path: folder + "/calendar.png" });
      await next.click();
      await expect(month).not.toHaveText(original);
      await prev.click();
      await expect(month).toHaveText(original);
      await calendar.getByRole("button", { name: scene.today, exact: true }).click();
      const selected = calendar.locator("button[aria-pressed=true]");
      await expect(selected).toHaveCount(1);
      const dayButtons = calendar.locator("button[aria-pressed]");
      expect(await dayButtons.count()).toBeGreaterThanOrEqual(28);
      for (const day of await dayButtons.all()) {
        const bounds = (await day.boundingBox())!;
        expect(bounds.width).toBeGreaterThanOrEqual(24);
        expect(bounds.height).toBeGreaterThanOrEqual(44);
      }
      await create.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await page.screenshot({ path: folder + "/year-form.png" });
      const close = dialog.getByRole("button", { name: "Close", exact: true });
      const closeBox = (await close.boundingBox())!;
      await close.click();
      await expect(dialog).toHaveCount(0);
      await expect(calendar).toBeVisible();
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      await page.screenshot({ path: folder + "/calendar-text-200.png" });
      const overflow = await page.locator(".school-content").evaluate(el => el.scrollWidth - el.clientWidth);
      const evidence = { locale: scene.locale, metrics, overflow, closeBox };
      console.log("P09 calendar geometry", JSON.stringify(evidence));
      writeFileSync(folder + "/geometry.json", JSON.stringify(evidence, null, 2));
      expect(metrics.createHeight).toBeGreaterThanOrEqual(48);
      expect(Math.min(metrics.arrowWidth, metrics.arrowHeight, closeBox.width, closeBox.height)).toBeGreaterThanOrEqual(44);
      expect(metrics.yearRadius).toBeGreaterThanOrEqual(22);
      expect(metrics.calendarRadius).toBeGreaterThanOrEqual(22);
      if (scene.locale === "ar") expect(["normal", "0px"]).toContain(metrics.titleTracking);
      expect(overflow).toBeLessThanOrEqual(1);
    } finally {
      await context.tracing.stop({ path: folder + "/trace.zip" });
      await school.close();
    }
  });
}
