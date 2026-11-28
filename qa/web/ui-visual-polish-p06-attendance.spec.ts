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
      const checkFilterSpacing = async (state: string) => {
        const layout = await page.locator(".attendance-filters").evaluate(el => {
          const parts = Array.from(el.children).map(child => child.getBoundingClientRect()).filter(rect => rect.height > 0);
          return { gaps: parts.slice(1).map((rect, index) => rect.top - parts[index]!.bottom), count: parts.length };
        });
        console.log("P11 attendance filter spacing", JSON.stringify({ locale: scene.locale, state, ...layout }));
        expect(layout.count).toBeGreaterThanOrEqual(4);
        for (const gap of layout.gaps) expect(gap).toBeGreaterThanOrEqual(8);
      };
      await checkFilterSpacing("normal");
      await page.screenshot({ path: folder + "/ready.png" });
      await measureReflow("normal");
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      await page.screenshot({ path: folder + "/ready-text-200.png" });
      await measureReflow("text-200");
      await checkFilterSpacing("text-200");
      if (scene.locale === "de") {
        const heading = page.getByRole("heading", { name: "Anwesenheit", level: 1, exact: true });
        await expect(heading).toBeVisible();
        const wrapping = await heading.evaluate(el => {
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          const breaks: number[] = [];
          let letters = 0, prior: number | undefined;
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const text = node.textContent ?? "";
            for (let i = 0; i < text.length; i++) {
              if (text[i] === "\u00ad") continue;
              const range = document.createRange();
              range.setStart(node, i);
              range.setEnd(node, i + 1);
              const rect = Array.from(range.getClientRects()).filter(rect => rect.width > 0).at(-1);
              if (!rect) throw new Error("Missing attendance heading glyph geometry");
              const top = Math.round(rect.top);
              if (prior !== undefined && prior !== top) breaks.push(letters);
              prior = top;
              letters++;
            }
          }
          return { text: el.textContent?.replaceAll("\u00ad", ""), breaks };
        });
        expect(wrapping.text).toBe("Anwesenheit");
        console.log("P06 attendance heading breaks", JSON.stringify(wrapping));
        expect(wrapping.breaks.filter(index => ![2, 4, 7].includes(index))).toEqual([]);
      }
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
