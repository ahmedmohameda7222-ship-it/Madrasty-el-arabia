import { expect, test } from "@playwright/test";
import { schoolFixtures } from "../fixtures/school";
import { localOrigin } from "../support/target";

test("school header stays in one row at normal mobile text size in both locales", async ({ page, context }) => {
  const school = schoolFixtures();
  try {
    await school.seed();
    const token = await school.bearer("guardian-de", "guardian");
    await context.addCookies([{ name: "madrasty-session", value: token, url: localOrigin, httpOnly: true, sameSite: "Lax" }]);
    for (const locale of ["de", "ar"]) for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`/${locale}/school/more/homework`);
      const header = page.locator(".school-shell > .school-header");
      await expect(header).toBeVisible();
      const visible = await header.locator(".brand img, .brand span, .header-actions > a").evaluateAll((els) => els.map(el => {
        const box = el.getBoundingClientRect();
        return { text: el.textContent?.trim() || el.tagName, centerY: box.y + box.height / 2,
          x: box.x, right: box.right, width: box.width, height: box.height };
      }));
      expect(visible.length).toBeGreaterThanOrEqual(4);
      const centers = visible.map(item => item.centerY);
      expect(Math.max(...centers) - Math.min(...centers), `${locale} header unexpectedly wraps at ${width}px: ${JSON.stringify(visible)}`).toBeLessThanOrEqual(20);
      for (const item of visible) {
        expect(item.x, `${locale} ${width} ${item.text}`).toBeGreaterThanOrEqual(-1);
        expect(item.right, `${locale} ${width} ${item.text}`).toBeLessThanOrEqual(width + 1);
      }
      await expect(header.locator(".brand")).toHaveAttribute("aria-label", /\S/);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${locale} unexpected body scroll at ${width}px`).toBeLessThanOrEqual(1);
    }
  } finally {
    await school.close();
  }
});
