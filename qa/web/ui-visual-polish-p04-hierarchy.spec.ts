import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { schoolFixtures } from "../fixtures/school";
import { localOrigin } from "../support/target";

const stage = process.env.VISUAL_POLISH_BASELINE === "1" ? "before" : "candidate";
function evidence(id: string, engine: string) {
  const folder = `qa-artifacts/visual-polish/P04/${id}/${stage}-${engine}`;
  mkdirSync(folder, { recursive: true });
  return folder;
}
async function reflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  expect(await page.locator(".school-content").evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
}

for (const scene of [{ locale: "de", width: 390, theme: "light" }, { locale: "ar", width: 320, theme: "dark" }] as const) {
  test(`P04 home and More visual hierarchy ${scene.locale}`, async ({ page, context, browser }) => {
    const school = schoolFixtures();
    const folder = evidence(`hierarchy-${scene.locale}-${scene.width}`, browser.browserType().name());
    await context.tracing.start({ screenshots: true, snapshots: true });
    try {
      await school.seed();
      const token = await school.bearer("teacher", "teacher");
      await context.addCookies([{ name: "madrasty-session", value: token, url: localOrigin, httpOnly: true, sameSite: "Lax" }]);
      await page.setViewportSize({ width: scene.width, height: 844 });
      await page.emulateMedia({ colorScheme: scene.theme, reducedMotion: "reduce" });
      const base = `/${scene.locale}/school`;
      expect((await page.goto(base + "/home"))?.status()).toBe(200);
      const schedule = page.locator('.home-dashboard-card a.plain-button[href$="/more/timetable"]');
      const assignments = page.locator(".home-dashboard-card a.group-row");
      await expect(schedule).toBeVisible();
      await expect(assignments.first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const geometry = await schedule.evaluate(el => ({
        height: el.getBoundingClientRect().height,
        radius: parseFloat(getComputedStyle(el).borderTopLeftRadius),
      }));
      const row = await assignments.first().evaluate(el => ({
        display: getComputedStyle(el).display,
        titleWeight: Number(getComputedStyle(el.querySelector("bdi")!).fontWeight),
      }));
      await reflow(page);
      await page.screenshot({ path: folder + "/home.png" });
      await page.goto(base + "/more");
      const summary = page.locator(".more-group summary").first();
      await expect(summary).toBeVisible();
      await summary.click();
      const link = page.locator(".more-group[open] .more-row").first();
      await expect(link).toBeVisible();
      const summarySize = await summary.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
      const rowSize = await link.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
      await reflow(page);
      await page.screenshot({ path: folder + "/more.png" });
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      await reflow(page);
      await page.screenshot({ path: folder + "/more-text-200.png" });
      writeFileSync(folder + "/geometry.json", JSON.stringify({ geometry, row, summarySize, rowSize }, null, 2));
      // Log geometry only; fixture data, tokens, traces and screenshots stay local.
      console.log("P04 hierarchy", JSON.stringify({ locale: scene.locale, geometry, row, summarySize, rowSize }));
      expect(geometry.height).toBeGreaterThanOrEqual(48);
      expect(geometry.radius).toBeGreaterThanOrEqual(geometry.height / 2);
      expect(row.display).toBe("grid");
      expect(row.titleWeight).toBeGreaterThanOrEqual(600);
      expect(summarySize).toBeGreaterThanOrEqual(18);
      expect(summarySize).toBeGreaterThan(rowSize);
    } finally {
      await context.tracing.stop({ path: folder + "/trace.zip" });
      await school.close();
    }
  });
}
