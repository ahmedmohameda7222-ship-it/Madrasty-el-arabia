import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { schoolFixtures } from "../fixtures/school";
import { fixtureApi } from "../support/api";
import { schoolClock } from "../fixtures/clock";
import { localOrigin } from "../support/target";

for (const scene of [
  { locale: "de", width: 390, theme: "light", tally: "Anwesenheitsliste" },
  { locale: "ar", width: 320, theme: "dark", tally: "كشف الحضور" },
] as const) {
  test(`P06 configured attendance visual hierarchy ${scene.locale}`, async ({ page, context, browser }) => {
    const school = schoolFixtures();
    const folder = `qa-artifacts/visual-polish/P06/${scene.locale}-${scene.width}/${browser.browserType().name()}`;
    mkdirSync(folder, { recursive: true });
    await context.tracing.start({ screenshots: true, snapshots: true });
    try {
      await school.seed();
      const token = await school.bearer("teacher", "teacher");
      const date = schoolClock.day;
      const catalogue = await fixtureApi(school, `/attendance/classes?date=${date}`, { token, persona: "teacher" });
      const classroom = catalogue.payload.data.classes[0];
      expect(classroom).toBeTruthy();
      const path = `/attendance/classes/${classroom.id}/days/${date}`;
      const initial = await fixtureApi(school, path, { token, persona: "teacher" });
      if (initial.payload.data.state === "unstarted") {
        await fixtureApi(school, path + "/open", { method: "POST", token, persona: "teacher", key: `${school.run}.visual-attendance.${date}` });
      }
      const sheet = (await fixtureApi(school, path, { token, persona: "teacher" })).payload.data;
      expect(sheet.state).toBe("open");
      expect(sheet.rows.length).toBeGreaterThan(0);
      await context.addCookies([{ name: "madrasty-session", value: token, url: localOrigin, httpOnly: true, sameSite: "Lax" }]);
      await page.setViewportSize({ width: scene.width, height: 844 });
      await page.emulateMedia({ colorScheme: scene.theme, reducedMotion: "reduce" });
      const url = `/${scene.locale}/school/attendance?class=${classroom.id}&date=${date}`;
      expect((await page.goto(url))?.status()).toBe(200);
      const tally = page.getByRole("list", { name: scene.tally, exact: true });
      await expect(tally).toBeVisible();
      const rows = page.locator("li.timetable-day");
      await expect(rows).toHaveCount(sheet.rows.length);
      const first = rows.first().getByRole("combobox");
      await expect(first).toBeEnabled();
      const values = await tally.locator("output").allTextContents();
      expect(values).toEqual(Object.values(sheet.counts).map(value => new Intl.NumberFormat(scene.locale).format(Number(value))));
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const tallyGeometry = await tally.locator("output").first().evaluate(el => ({
        size: parseFloat(getComputedStyle(el).fontSize),
        weight: Number(getComputedStyle(el).fontWeight),
      }));
      const rowGeometry = await rows.first().evaluate(el => ({
        inset: parseFloat(getComputedStyle(el).paddingInlineStart),
        selectorHeight: el.querySelector("select")!.getBoundingClientRect().height,
      }));
      const measureReflow = async (state: string) => {
        const geometry = await page.locator(".school-content").evaluate(root => {
          const box = root.getBoundingClientRect();
          const overflow = root.scrollWidth - root.clientWidth;
          const culprits = [...root.querySelectorAll("*")].filter(el => {
            if (el.classList.contains("screen-reader-only")) return false;
            const r = el.getBoundingClientRect();
            return r.width > 0 && (r.left < box.left - 1 || r.right > box.right + 1);
          }).slice(0, 15).map(el => ({
            tag: el.tagName, classes: typeof el.className === "string" ? el.className : "",
            width: Math.round(el.getBoundingClientRect().width),
          }));
          return { overflow, culprits };
        });
        if (geometry.overflow > 1) console.log("P06 overflow", JSON.stringify({ locale: scene.locale, state, ...geometry }));
        expect(geometry.overflow).toBeLessThanOrEqual(1);
      };
      await page.screenshot({ path: folder + "/ready.png" });
      await measureReflow("normal");
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      await page.screenshot({ path: folder + "/ready-text-200.png" });
      await measureReflow("text-200");
      writeFileSync(folder + "/geometry.json", JSON.stringify({ tallyGeometry, rowGeometry }, null, 2));
      console.log("P06 attendance geometry", JSON.stringify({ locale: scene.locale, tallyGeometry, rowGeometry }));
      expect(tallyGeometry.size).toBeGreaterThanOrEqual(20);
      expect(tallyGeometry.weight).toBeGreaterThanOrEqual(650);
      expect(rowGeometry.inset).toBeGreaterThanOrEqual(12);
      expect(rowGeometry.selectorHeight).toBeGreaterThanOrEqual(48);
    } finally {
      await context.tracing.stop({ path: folder + "/trace.zip" });
      await school.close();
    }
  });
}
