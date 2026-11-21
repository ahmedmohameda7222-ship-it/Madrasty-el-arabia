import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { setUpCalendar } from "../fixtures/calendar";
import { schoolFixtures } from "../fixtures/school";
import { fixtureApi } from "../support/api";
import { fixtureEmail, localOrigin } from "../support/target";

test("desktop web reconnects one safe attendance edit and surfaces the conflicting row", async ({ page, context }) => {
  const school = schoolFixtures();
  try {
    await school.seed();
    const admin = await school.bearer("admin", "admin");
    const { apple, ids } = await setUpCalendar(school, admin);
    const [teacher, guardian] = await Promise.all([school.bearer("teacher", "teacher"), school.bearer("guardian-ar", "guardian")]);
    const date = "2026-11-29";
    const path = `/attendance/classes/${apple.id}/days/${date}`;
    const opened = await fixtureApi(school, `${path}/open`, {
      method: "POST", token: teacher, persona: "teacher", key: `${school.run}.offline-sheet.${date}`,
    });
    const first = opened.payload.data.rows.find((row: { studentId: string }) => row.studentId === ids.ahmed);
    const second = opened.payload.data.rows.find((row: { studentId: string }) => row.studentId === ids.omar);
    expect([first?.studentId, second?.studentId]).toEqual([ids.ahmed, ids.omar]);
    expect(first.status).toBeNull();
    expect(second.status).toBeNull();
    await page.route("**/*", (route) => new URL(route.request().url()).origin === localOrigin ? route.continue() : route.abort());
    await page.goto("/de/account/sign-in");
    await page.locator('input[name="email"]').fill(fixtureEmail(school.run, "teacher"));
    await page.locator('input[name="password"]').fill(school.password);
    await page.locator("form button[type=submit],form button:not([type])").first().click();
    await expect(page).toHaveURL(/\/de\/school\/home$/);
    await page.goto(`/de/school/attendance?class=${apple.id}&date=${date}`);
    const firstMark = page.getByRole("combobox", { name: first.displayName, exact: true });
    const secondMark = page.getByRole("combobox", { name: second.displayName, exact: true });
    await expect(firstMark).toBeEnabled();
    await expect(secondMark).toBeEnabled();
    await context.setOffline(true);
    await firstMark.selectOption("present");
    await secondMark.selectOption("present");
    await page.getByRole("button", { name: "Entwurf speichern" }).click();
    await expect(page.getByText("Der Entwurf wurde auf dem Gerät gespeichert und wartet auf Abgleich.")).toBeVisible();
    const offlineRefresh = page.waitForEvent("requestfailed", (request) => new URL(request.url()).pathname === "/api/v1/attendance/classes");
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await offlineRefresh;
    await expect(page.getByRole("button", { name: "Erneut versuchen" }).first()).toBeVisible();
    const offline = await fixtureApi(school, path, { token: teacher });
    expect(offline.payload.data.rows.find((row: { studentId: string }) => row.studentId === ids.omar).status).toBeNull();
    await fixtureApi(school, `/children/${ids.ahmed}/attendance/excuses`, {
      method: "POST", token: guardian, persona: "guardian", key: randomUUID(), status: 201,
      body: { schoolDate: date, reason: "Synthetic offline conflict" },
    });
    await context.setOffline(false);
    await expect.poll(async () => {
      const latest = await fixtureApi(school, path, { token: teacher });
      return latest.payload.data.rows.find((row: { studentId: string }) => row.studentId === ids.omar).status;
    }, { timeout: 15_000 }).toBe("present");
    const result = await fixtureApi(school, path, { token: teacher });
    expect(result.payload.data.rows.find((row: { studentId: string }) => row.studentId === ids.ahmed).status).toBe("absent_excused");
    await expect(page.getByRole("button", { name: "Gespeicherten Status übernehmen" })).toBeVisible();
  } finally {
    await context.setOffline(false);
    await school.close();
  }
});
