import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { schoolFixtures } from "../fixtures/school";
import { fixtureApi } from "../support/api";
import { schoolClock } from "../fixtures/clock";
import { localOrigin } from "../support/target";

for (const scene of [
  { locale: "de", width: 390, theme: "light", list: "Klassen", dashboard: "Klassenübersicht", readonly: "Nur ansehen", pupils: "Schüler", profile: "Schülerprofil", openProfile: "Schülerprofil ansehen", exams: "Prüfungen und Noten", backClass: "Zurück zur Klasse", backList: "Zurück zu Klassen", forbidden: "Prüfung hinzufügen" },
  { locale: "ar", width: 320, theme: "dark", list: "الفصول", dashboard: "متابعة الفصل", readonly: "عرض فقط", pupils: "الطلبة", profile: "ملف الطالب", openProfile: "عرض ملف الطالب", exams: "الامتحانات والدرجات", backClass: "الرجوع للفصل", backList: "الرجوع للفصول", forbidden: "إضافة امتحان" },
] as const) {
  test(`P07 read-only class monitor hierarchy ${scene.locale}`, async ({ page, context, browser }) => {
    const school = schoolFixtures();
    const folder = `qa-artifacts/visual-polish/P07/monitor-${scene.locale}-${scene.width}/${browser.browserType().name()}`;
    mkdirSync(folder, { recursive: true });
    await context.tracing.start({ screenshots: true, snapshots: true });
    try {
      await school.seed();
      const admin = await school.bearer("admin", "admin");
      const teacher = await school.bearer("teacher", "teacher");
      const years = (await fixtureApi(school, "/school/years", { token: admin })).payload.data;
      const year = years.find((item: { state: string }) => item.state === "active");
      expect(year).toBeTruthy();
      const classes = (await fixtureApi(school, "/school/monitor/classes?yearId=" + year.id, { token: admin })).payload.data;
      const classroom = classes.find((item: { code: string }) => item.code === "QA_A");
      expect(classroom).toBeTruthy();
      const offerings = (await fixtureApi(school, "/academics/offerings", { token: teacher, persona: "teacher" })).payload.data;
      const offering = offerings.find((item: { classId: string }) => item.classId === classroom.classId);
      expect(offering).toBeTruthy();
      const publicTitle = "QA public " + randomUUID().slice(0, 8);
      const draftTitle = "QA draft " + randomUUID().slice(0, 8);
      for (const [title, announce] of [[publicTitle, true], [draftTitle, false]] as const) {
        const exam = (await fixtureApi(school, "/academics/exams", {
          method: "POST", token: teacher, persona: "teacher", key: randomUUID(), status: 201,
          body: { offeringId: offering.id, date: schoolClock.day, time: "10:00", kind: "oral", title, maxScore: 20 },
        })).payload.data;
        if (announce) await fixtureApi(school, `/academics/exams/${exam.id}/announce`, {
          method: "POST", token: teacher, persona: "teacher", key: randomUUID(),
          body: { revision: exam.revision, date: schoolClock.day, time: "10:00" },
        });
      }
      await context.addCookies([{ name: "madrasty-session", value: admin, url: localOrigin, httpOnly: true, sameSite: "Lax" }]);
      await page.setViewportSize({ width: scene.width, height: 844 });
      await page.emulateMedia({ colorScheme: scene.theme, reducedMotion: "reduce" });
      const base = `/${scene.locale}/school/more/oversight`;
      expect((await page.goto(base))?.status()).toBe(200);
      await expect(page.getByRole("heading", { name: scene.list, exact: true })).toBeVisible();
      const classCard = page.getByRole("button", { name: /^QA_A · / });
      await expect(classCard).toBeVisible();
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const cardRadius = await classCard.evaluate(el => parseFloat(getComputedStyle(el).borderTopLeftRadius));
      await page.screenshot({ path: folder + "/class-list.png" });
      await classCard.click();
      await expect(page.getByRole("heading", { name: scene.dashboard, exact: true })).toBeVisible();
      await expect(page.getByText(scene.readonly, { exact: true })).toBeVisible();
      expect(new URL(page.url()).searchParams.get("class")).toBe(classroom.classId);
      const metrics = page.locator('[class*="AdminClassMonitor_metric__"]');
      await expect(metrics).toHaveCount(4);
      const count = metrics.first().locator("strong");
      await expect(count).toHaveText(new Intl.NumberFormat(scene.locale === "ar" ? "ar-EG" : "de-DE").format(classroom.studentCount));
      const geometry = await count.evaluate(el => ({
        size: parseFloat(getComputedStyle(el).fontSize),
        weight: Number(getComputedStyle(el).fontWeight),
        cardRadius: parseFloat(getComputedStyle(el.parentElement!).borderTopLeftRadius),
      }));
      const navGeometry = () => page.locator(".school-nav").evaluate(nav => {
        const links = Array.from(nav.querySelectorAll(":scope > a"));
        const rects = links.map(link => link.getBoundingClientRect());
        const content = document.querySelector(".school-content")!.getBoundingClientRect();
        return {
          count: rects.length,
          rows: new Set(rects.map(rect => Math.round(rect.top))).size,
          minTarget: Math.min(...rects.map(rect => Math.min(rect.width, rect.height))),
          overlap: rects.some((rect, i) => rects.slice(i + 1).some(other =>
            rect.left < other.right - 1 && rect.right > other.left + 1 && rect.top < other.bottom - 1 && rect.bottom > other.top + 1)),
          availableContent: content.height,
        };
      });
      const normalNav = await navGeometry();
      expect(normalNav.count).toBe(5);
      expect(normalNav.rows).toBe(1);
      expect(normalNav.minTarget).toBeGreaterThanOrEqual(44);
      expect(normalNav.overlap).toBe(false);
      await page.screenshot({ path: folder + "/dashboard.png" });
      await page.getByRole("button", { name: scene.exams, exact: true }).click();
      await expect(page.getByText(publicTitle, { exact: true })).toBeVisible();
      await expect(page.getByText(draftTitle, { exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: scene.forbidden, exact: true })).toHaveCount(0);
      await page.screenshot({ path: folder + "/published-only.png" });
      await page.getByRole("button", { name: scene.pupils, exact: true }).click();
      await page.getByRole("button", { name: scene.openProfile, exact: true }).first().click();
      await expect(page.getByRole("heading", { name: scene.profile, exact: true })).toBeVisible();
      expect(new URL(page.url()).searchParams.get("student")).toBeTruthy();
      await page.screenshot({ path: folder + "/student.png" });
      await page.getByRole("button", { name: scene.backClass, exact: true }).click();
      await expect(page.getByRole("heading", { name: scene.dashboard, exact: true })).toBeVisible();
      expect(new URL(page.url()).searchParams.get("student")).toBeNull();
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      await page.screenshot({ path: folder + "/dashboard-text-200.png" });
      const largeNav = await navGeometry();
      const columns = await page.locator('[class*="AdminClassMonitor_sections__"]').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length);
      console.log("P11 large-text layout", JSON.stringify({ locale: scene.locale, normalNav, largeNav, columns }));
      expect(largeNav.count).toBe(normalNav.count);
      expect(largeNav.rows).toBeGreaterThan(1);
      expect(largeNav.minTarget).toBeGreaterThanOrEqual(44);
      expect(largeNav.overlap).toBe(false);
      expect(largeNav.availableContent).toBeGreaterThanOrEqual(240);
      expect(columns).toBe(1);

      expect(await page.locator(".school-content").evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
      await page.getByRole("button", { name: scene.backList, exact: true }).click();
      await expect(page.getByRole("heading", { name: scene.list, exact: true })).toBeVisible();
      expect(new URL(page.url()).searchParams.get("class")).toBeNull();
      writeFileSync(folder + "/geometry.json", JSON.stringify({ cardRadius, geometry }, null, 2));
      console.log("P07 monitor geometry", JSON.stringify({ locale: scene.locale, cardRadius, geometry }));
      expect(cardRadius).toBeGreaterThanOrEqual(22);
      expect(geometry.cardRadius).toBeGreaterThanOrEqual(22);
      expect(geometry.size).toBeGreaterThanOrEqual(24);
      expect(geometry.weight).toBeGreaterThanOrEqual(700);
    } finally {
      await context.tracing.stop({ path: folder + "/trace.zip" });
      await school.close();
    }
  });
}
