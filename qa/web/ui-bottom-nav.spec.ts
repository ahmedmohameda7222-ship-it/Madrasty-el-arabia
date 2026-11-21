import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { schoolFixtures } from "../fixtures/school";
import { localOrigin } from "../support/target";

test("German attendance bottom tab remains readable while exposing its full accessible name", async ({ page, context }) => {
  const school = schoolFixtures();
  try {
    await school.seed();
    const token = await school.bearer("teacher", "teacher");
    await context.addCookies([{ name: "madrasty-session", value: token, url: localOrigin, httpOnly: true, sameSite: "Lax" }]);
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/de/school/attendance");
      const links = page.locator(".school-nav > a");
      await expect(links).toHaveCount(4);
      const attendance = links.nth(1);
      await expect(attendance).toHaveAttribute("aria-current", "page");
      await expect(attendance).toHaveAttribute("aria-label", "Anwesenheit");
      await expect(attendance.locator("span")).toHaveText("Anwes.");
      const lines = await attendance.locator("span").evaluate((element) => {
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.3;
        return box.height / lineHeight;
      });
      expect(lines, `German bottom label wraps at ${width}px`).toBeLessThanOrEqual(1.3);
      const box = await attendance.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      mkdirSync("qa-artifacts/ui-after", { recursive: true });
      await page.screenshot({ path: `qa-artifacts/ui-after/UIX05-teacher-de-attendance-${width}-ready.png`, animations: "disabled" });
    }
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    const zoomedOverflow = await page.locator(".school-nav").evaluate(el => el.scrollWidth - el.clientWidth);
    expect(zoomedOverflow, "200%-text zoom must not push navigation beyond its own viewport").toBeLessThanOrEqual(1);
    // The mobile abbreviation must not replace the established full label on desktop.
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto("/de/school/attendance");
    const desktopLabel = page.locator(".school-nav > a").nth(1).locator("span");
    await expect(desktopLabel).toHaveText("Anwesenheit");
    await page.screenshot({ path: "qa-artifacts/ui-after/UIX05-teacher-de-attendance-1024-200pct-text.png", animations: "disabled" });
    await page.setViewportSize({ width: 430, height: 844 });
    await page.goto("/ar/school/attendance");
    await expect(page.locator(".school-nav > a").nth(1)).toHaveAttribute("aria-current", "page");
    await page.screenshot({ path: "qa-artifacts/ui-after/UIX05-teacher-ar-attendance-430-200pct-text.png", animations: "disabled" });
  } finally {
    await school.close();
  }
});
