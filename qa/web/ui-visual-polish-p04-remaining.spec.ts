import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { schoolFixtures } from "../fixtures/school";
import { localOrigin } from "../support/target";
import { teachingViewSchema } from "../../packages/contracts/src/school/assignments";
import { timetableWeekSchema } from "../../packages/contracts/src/school/timetable";
import { workQueuesSchema, queuePageSchema, schoolQueueKeySchema, dashboardModuleKeySchema } from "../../packages/contracts/src/school/work-queues";

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
const teachers = [
  { actor: "teacher", locale: "de", width: 390, theme: "light" },
  { actor: "teacher", locale: "ar", width: 320, theme: "dark" },
  { actor: "teacher-other", locale: "de", width: 320, theme: "dark" },
  { actor: "substitute", locale: "ar", width: 390, theme: "light" },
] as const;
for (const scene of teachers) {
  test(`P04 teacher home ${scene.actor} ${scene.locale} ${scene.width}`, async ({ page, context, browser }) => {
    const school = schoolFixtures();
    const folder = evidence(`teacher-${scene.actor}-${scene.locale}-${scene.width}`, browser.browserType().name());
    await context.tracing.start({ screenshots: true, snapshots: true });
    try {
      await school.seed();
      const token = await school.bearer(scene.actor, "teacher");
      await context.addCookies([{ name: "madrasty-session", value: token, url: localOrigin, httpOnly: true, sameSite: "Lax" }]);
      await page.setViewportSize({ width: scene.width, height: 844 });
      await page.emulateMedia({ colorScheme: scene.theme });
      const base = `/${scene.locale}/school`;
      const assignmentsReply = page.waitForResponse(r => new URL(r.url()).pathname === "/api/v1/me/teaching");
      const summaryReply = page.waitForResponse(r => new URL(r.url()).pathname === "/api/v1/school/work-queues");
      const timetableReply = page.waitForResponse(r => new URL(r.url()).pathname === "/api/v1/school/timetable");
      // A setup-required school legitimately does not request the timetable.
      void timetableReply.catch(() => undefined);
      expect((await page.goto(base + "/home"))?.status()).toBe(200);
      const [assignmentsResponse, summaryResponse] = await Promise.all([assignmentsReply, summaryReply]);
      expect(assignmentsResponse.status()).toBe(200);
      expect(summaryResponse.status()).toBe(200);
      const assignments = teachingViewSchema.array().parse((await assignmentsResponse.json()).data);
      const summary = workQueuesSchema.parse((await summaryResponse.json()).data);
      const assignmentCard = page.locator(".home-dashboard-card").filter({ has: page.getByRole("heading", {
        name: scene.locale === "ar" ? "تكليفاتي الحالية" : "Meine aktuellen Einsätze", exact: true,
      }) });
      await expect(assignmentCard).toBeVisible();
      const links = assignmentCard.locator("a.group-row");
      await expect(links).toHaveCount(assignments.length);
      for (const [i, row] of assignments.entries()) {
        await expect(links.nth(i)).toHaveAttribute("href", row.kind === "primary" ? `${base}/attendance?class=${row.classId}` : `${base}/more/timetable`);
        await expect(links.nth(i).locator("bdi")).toHaveText(scene.locale === "ar" ? row.classNameAr : row.classNameDe);
      }
      let lessonCount: number | null = null;
      if (summary.setupRequired === true) {
        await expect(page.getByText(scene.locale === "ar" ? "هيظهر الجدول بعد ما إدارة المدرسة تكمّل الإعدادات." : "Der Stundenplan erscheint nach der Schuleinrichtung.", { exact: true })).toBeVisible();
      } else {
        const response = await timetableReply;
        expect(response.status()).toBe(200);
        const week = timetableWeekSchema.parse((await response.json()).data);
        const lessons = week.slots.filter(row => row.date === summary.today && row.teaching).sort((a,b) => a.start-b.start);
        lessonCount = lessons.length;
        const day = page.locator(".home-dashboard-card").filter({ has: page.getByRole("heading", {
          name: scene.locale === "ar" ? "دروس اليوم" : "Unterricht heute", exact: true,
        }) });
        await expect(day).toBeVisible();
        await expect(day.locator(".timetable-session")).toHaveCount(lessons.length);
        for (const [i, lesson] of lessons.entries()) {
          await expect(day.locator(".timetable-session").nth(i).locator("bdi").nth(1)).toHaveText(scene.locale === "ar" ? lesson.subjectNameAr : lesson.subjectNameDe);
        }
        const schedule = day.locator("a.plain-button");
        await expect(schedule).toHaveAttribute("href", base + "/more/timetable");
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        await reflow(page);
        await page.screenshot({ path: folder + "/home.png" });
        await schedule.click();
        await expect(page).toHaveURL(localOrigin + base + "/more/timetable");
        await page.goBack();
        await expect(day).toBeVisible();
      }
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await reflow(page);
      await page.screenshot({ path: folder + "/home-return.png" });
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      await page.screenshot({ path: folder + "/home-text-200.png" });
      await reflow(page);
      writeFileSync(folder + "/observed.json", JSON.stringify({ ...scene, assignments: assignments.length, lessonCount, setupRequired: summary.setupRequired === true }, null, 2));
    } finally {
      await context.tracing.stop({ path: folder + "/trace.zip" });
      await school.close();
    }
  });
}

const moreActors = [
  { actor: "admin", persona: "admin" }, { actor: "admin-two", persona: "admin" },
  { actor: "office", persona: "admin" }, { actor: "finance", persona: "admin" },
  { actor: "supervisor", persona: "admin" }, { actor: "teacher", persona: "teacher" },
  { actor: "substitute", persona: "teacher" }, { actor: "guardian-ar", persona: "guardian" },
  { actor: "guardian-de", persona: "guardian" },
] as const;
for (const actor of moreActors) for (const locale of ["de", "ar"] as const) {
  test(`P04 More ${actor.actor} ${locale} disclosure and route inventory`, async ({ page, context, browser }) => {
    const school = schoolFixtures();
    const width = locale === "ar" ? 320 : 390;
    const folder = evidence(`more-${actor.actor}-${locale}-${width}`, browser.browserType().name());
    await context.tracing.start({ screenshots: true, snapshots: true });
    try {
      await school.seed();
      const token = await school.bearer(actor.actor, actor.persona);
      await context.addCookies([{ name: "madrasty-session", value: token, url: localOrigin, httpOnly: true, sameSite: "Lax" }]);
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({ colorScheme: locale === "ar" ? "dark" : "light", reducedMotion: "reduce" });
      const base = `/${locale}`;
      expect((await page.goto(base + "/school/more"))?.status()).toBe(200);
      const groups = page.locator(".more-index .more-group");
      await expect(groups.first()).toBeVisible();
      const routes = await groups.locator("a.more-row").evaluateAll(rows => rows.map(row => row.getAttribute("href")!));
      for (const suffix of ["/account/profile", "/account/preferences", "/account/security"]) expect(routes).toContain(base + suffix);
      if (actor.persona === "guardian") {
        expect(routes).toEqual(["/school/more/timetable", "/school/more/enrollment-stops", "/school/more/finance-reports", "/school/more/invoices", "/account/profile", "/account/preferences", "/account/security"].map(s => base + s));
      }
      if (actor.persona === "teacher") {
        expect(routes).toEqual(["grading", "reports", "exams", "evaluations", "homework", "academics", "curriculum", "timetable"].map(s => base + "/school/more/" + s).concat(["/account/profile", "/account/preferences", "/account/security"].map(s => base + s)));
        await expect(page.locator(`.school-nav > a[href="${base}/school/attendance"]`)).toHaveCount(1);
      }
      if (actor.actor === "finance") {
        for (const suffix of ["finance-reports", "invoices", "receipts?view=cashbook", "fee-settings"]) expect(routes).toContain(base + "/school/more/" + suffix);
        expect(routes).not.toContain(base + "/staff/access");
      }
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await page.screenshot({ path: folder + "/collapsed.png" });
      const count = await groups.count();
      for (let i = 0; i < count; i++) {
        const group = groups.nth(i), summary = group.locator("summary"), rows = group.locator(".more-rows");
        await expect(group).not.toHaveAttribute("open", "");
        await summary.focus();
        await page.keyboard.press("Enter");
        await expect(group).toHaveAttribute("open", "");
        await expect(rows).toBeVisible();
        for (const row of await rows.locator("a.more-row").all()) {
          await expect(row).toBeVisible();
          expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        }
        await reflow(page);
        await page.screenshot({ path: folder + `/group-${i}.png` });
        await page.keyboard.press("Enter");
        await expect(group).not.toHaveAttribute("open", "");
        await expect(rows).toBeHidden();
        await expect(summary).toBeFocused();
      }
      writeFileSync(folder + "/observed.json", JSON.stringify({ ...actor, locale, width, routes }, null, 2));
    } finally {
      await context.tracing.stop({ path: folder + "/trace.zip" });
      await school.close();
    }
  });
}

for (const key of [...schoolQueueKeySchema.options, ...dashboardModuleKeySchema.options]) {
  test(`P04 Arabic dark queue ${key}: actual rows, date and observed pagination`, async ({ page, context, browser }) => {
    const school = schoolFixtures();
    const folder = evidence(`queue-ar-320-${key}`, browser.browserType().name());
    await context.tracing.start({ screenshots: true, snapshots: true });
    try {
      await school.seed();
      const token = await school.bearer("admin", "admin");
      await context.addCookies([{ name: "madrasty-session", value: token, url: localOrigin, httpOnly: true, sameSite: "Lax" }]);
      await page.setViewportSize({ width: 320, height: 844 });
      await page.emulateMedia({ colorScheme: "dark" });
      const api = `/api/v1/school/work-queues/${key}`;
      const pending = page.waitForResponse(r => new URL(r.url()).pathname === api);
      expect((await page.goto(`/ar/school/home/queues/${key}`))?.status()).toBe(200);
      const response = await pending;
      expect(response.status()).toBe(200);
      const body = await response.json();
      const data = queuePageSchema.parse(body.data);
      const card = page.locator(".work-queue-detail"), rows = card.locator(".group-list > li");
      await expect(rows).toHaveCount(data.items.length);
      for (const [i,item] of data.items.entries()) {
        await expect(rows.nth(i).locator("a > bdi")).toHaveText(item.titleAr);
        await expect(rows.nth(i).locator("small bdi")).toHaveText(item.detailAr);
      }
      if (!data.items.length) await expect(card.getByText("ما فيش مهام مفتوحة في التاريخ ده.", { exact: true })).toBeVisible();
      const back = page.locator('.school-content > a[href*="/home/tasks"]');
      await expect(back).toHaveAttribute("href", `/ar/school/home/tasks?asOf=${data.asOf}`);
      await reflow(page);
      await page.screenshot({ path: folder + "/initial.png" });
      const more = card.getByRole("button", { name: "عرض المزيد", exact: true });
      let paginated = false;
      if (body.meta?.nextCursor) {
        await expect(more).toBeVisible();
        const next = page.waitForResponse(r => {
          const url = new URL(r.url());
          return url.pathname === api && url.searchParams.get("cursor") === body.meta.nextCursor;
        });
        await more.click();
        const reply = await next;
        expect(reply.status()).toBe(200);
        const appended = queuePageSchema.parse((await reply.json()).data);
        expect(appended.asOf).toBe(data.asOf);
        await expect(rows).toHaveCount(data.items.length + appended.items.length);
        await reflow(page);
        await page.screenshot({ path: folder + "/page-two.png" });
        paginated = true;
      } else await expect(more).toHaveCount(0);
      await back.click();
      await expect(page).toHaveURL(localOrigin + `/ar/school/home/tasks?asOf=${data.asOf}`);
      writeFileSync(folder + "/observed.json", JSON.stringify({ key, asOf: data.asOf, count: data.items.length, paginated }, null, 2));
    } finally {
      await context.tracing.stop({ path: folder + "/trace.zip" });
      await school.close();
    }
  });
}
