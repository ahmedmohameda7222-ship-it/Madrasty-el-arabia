import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { schoolFixtures } from "../fixtures/school";
import { localOrigin } from "../support/target";

const before = process.env.VISUAL_POLISH_BASELINE === "1";
for (const scene of [
  { actor: "admin", persona: "admin", locale: "de", width: 390 },
  { actor: "guardian-ar", persona: "guardian", locale: "ar", width: 320 },
] as const) {
  test(`dashboard priority and existing actions for ${scene.persona}`, async ({ page, context }) => {
    const school = schoolFixtures();
    const folder = `qa-artifacts/visual-polish/P04/${scene.persona}-${scene.locale}-${scene.width}/${before ? "before" : "after"}`;
    mkdirSync(folder, { recursive: true });
    try {
      await school.seed();
      const token = await school.bearer(scene.actor, scene.persona);
      await context.addCookies([{ name: "madrasty-session", value: token, url: localOrigin, httpOnly: true, sameSite: "Lax" }]);
      await page.setViewportSize({ width: scene.width, height: 844 });
      await page.emulateMedia({ colorScheme: scene.locale === "ar" ? "dark" : "light" });
      const base = `/${scene.locale}/school`;
      const response = await page.goto(base + "/home");
      expect(response?.status()).toBe(200);
      const hero = page.locator(".role-hero");
      const heroAction = hero.locator("a");
      await expect(hero).toBeVisible();
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      if (scene.persona === "admin") {
        const counts = page.locator(".admin-start-metrics dd");
        await expect(counts).toHaveCount(3);
        for (const value of await counts.all()) await expect(value).toHaveText(/\p{N}/u);
        const size = await counts.first().evaluate(element => parseFloat(getComputedStyle(element).fontSize));
        await page.screenshot({ path: `${folder}/home.png` });
        await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
        expect(await page.locator(".admin-start-metrics").evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
        await page.screenshot({ path: `${folder}/home-text-200.png` });
        await page.evaluate(() => document.documentElement.style.removeProperty("font-size"));
        await expect(heroAction).toHaveAttribute("href", new RegExp(base + "/home/tasks"));
        await heroAction.click();
        await expect(page).toHaveURL(new RegExp(base + "/home/tasks"));
        await expect(page.locator(".admin-start-filter input[type=date]")).toBeVisible();
        await page.screenshot({ path: `${folder}/tasks.png` });
        if (!before) expect(size).toBeGreaterThanOrEqual(32);
      } else {
        const picker = page.getByRole("button", { name: "تغيير الاختيار" });
        await expect(picker).toBeVisible();
        const gutter = await picker.evaluate(element => parseFloat(getComputedStyle(element.parentElement!).paddingBlockStart));
        await page.screenshot({ path: `${folder}/home.png` });
        await picker.click();
        const sheet = page.locator(".scope-sheet[open]");
        await expect(sheet).toBeVisible();
        await sheet.locator("button[aria-pressed=true]").click();
        await expect(sheet).toHaveCount(0);
        await expect(picker).toBeFocused();
        await expect(heroAction).toHaveAttribute("href", new RegExp(base + "/children\\?child="));
        if (!before) expect(gutter).toBeLessThanOrEqual(8);
      }
    } finally { await school.close(); }
  });
}

test("all Admin work queue routes render the returned rows in the existing context", async ({ page, context }) => {
  const { schoolQueueKeySchema, dashboardModuleKeySchema, queuePageSchema } =
    await import("../../packages/contracts/src/school/work-queues");
  const school = schoolFixtures();
  const folder = "qa-artifacts/visual-polish/P04/queue-details/de-390";
  mkdirSync(folder, { recursive: true });
  try {
    await school.seed();
    const token = await school.bearer("admin", "admin");
    await context.addCookies([{ name: "madrasty-session", value: token, url: localOrigin, httpOnly: true, sameSite: "Lax" }]);
    await page.setViewportSize({ width: 390, height: 844 });
    for (const key of [...schoolQueueKeySchema.options, ...dashboardModuleKeySchema.options]) {
      const route = `/de/school/home/queues/${key}`;
      const [response, navigation] = await Promise.all([
        page.waitForResponse(reply => new URL(reply.url()).pathname === `/api/v1/school/work-queues/${key}`, { timeout: 30_000 }),
        page.goto(route),
      ]);
      expect(navigation?.status(), route).toBe(200);
      expect(response.status(), route).toBe(200);
      const { items, asOf } = queuePageSchema.parse((await response.json()).data);
      const card = page.locator(".work-queue-detail");
      await expect(card.locator(".group-list > li")).toHaveCount(items.length);
      await expect(card.locator("p bdi").first()).toHaveText(asOf);
      await expect(page.locator('.school-content > a[href*="/home/tasks"]')).toHaveAttribute("href", `/de/school/home/tasks?asOf=${asOf}`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: `${folder}/${key}-${items.length ? "populated" : "empty"}.png` });
    }
  } finally { await school.close(); }
});
