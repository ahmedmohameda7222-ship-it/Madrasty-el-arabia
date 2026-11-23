import { expect, test } from "@playwright/test";
import { setUpCalendar } from "../fixtures/calendar";
import { schoolClock as clock } from "../fixtures/clock";
import { schoolFixtures } from "../fixtures/school";
import { localOrigin } from "../support/target";
import { fixtureApi } from "../support/api";

test("admin calendar uses the approved visual workflow and can reset a school-wide day", async ({ page, context }) => {
  test.setTimeout(90_000);
  const school = schoolFixtures();
  try {
    await school.seed();
    const admin = await school.bearer("admin", "admin");
    const { year } = await setUpCalendar(school, admin);
    await context.addCookies([
      { name: "madrasty-session", value: admin, url: localOrigin, httpOnly: true, sameSite: "Lax" },
      { name: "madrasty-csrf", value: "a".repeat(64), url: localOrigin, sameSite: "Lax" },
    ]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/de/school/more/calendar");
    await expect(page.getByRole("heading", { name: "Schuljahr und Kalender" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: /Neues Schuljahr/ })).toBeVisible();
    // The shared back link must not collide with the calendar's eyebrow/header.
    const backLink = page.getByRole("link", { name: /Zurück.*Mehr/ });
    await expect(backLink).toBeVisible();
    const backBounds = await backLink.boundingBox();
    const eyebrowBounds = await page.getByText("SCHULORGANISATION").boundingBox();
    expect(backBounds).not.toBeNull();
    expect(eyebrowBounds).not.toBeNull();
    expect(eyebrowBounds!.y - (backBounds!.y + backBounds!.height)).toBeGreaterThanOrEqual(12);

    // Dark panels should be blue/navy, not the old green-tinted surfaces.
    await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
    const yearCardBackground = await page.getByText("Ausgewähltes Schuljahr").locator("..")
      .evaluate((element) => getComputedStyle(element).backgroundColor);
    const channels = yearCardBackground.match(/\d+/g)?.slice(0, 3).map(Number);
    expect(channels).toHaveLength(3);
    expect(channels![2] - channels![1]).toBeGreaterThanOrEqual(10);

    await expect(page.getByText("Reguläre Unterrichtstage", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Schuleinstellungen")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: new RegExp(clock.startsOn.slice(0, 4)) })).toBeVisible();

    // The fixture year teaches all seven days; change tomorrow as a school-wide exception.
    if (clock.holiday.slice(0, 7) !== clock.day.slice(0, 7)) {
      await page.getByRole("button", { name: "Nächster Monat" }).click();
    }
    const dateLabel = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
      .format(new Date(clock.holiday + "T12:00:00Z"));
    const day = page.getByRole("button", { name: new RegExp("^" + dateLabel) });
    await expect(day).toBeVisible();
    await day.click();
    await page.getByRole("button", { name: "Unterricht fällt aus" }).click();
    await page.getByRole("textbox", { name: "Grund / Notiz" }).fill("QA Schulferien " + school.run.slice(0, 8));
    await page.getByRole("button", { name: "Änderung speichern" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Änderung gespeichert" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ausnahme entfernen" })).toBeVisible();
    const { payload: stored } = await fixtureApi(school, "/school/years/" + year.id + "/days", { token: admin });
    expect(stored.data.some((entry: {schoolDate: string; classId: string | null}) =>
      entry.schoolDate === clock.holiday && entry.classId === null)).toBe(true);

    await page.getByRole("button", { name: "Ausnahme entfernen" }).click();
    const dialog = page.getByRole("dialog", { name: "Ausnahme wirklich entfernen?" });
    await dialog.getByRole("button", { name: "Ausnahme entfernen" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("Ausnahme entfernt.")).toBeVisible();
    const { payload: removed } = await fixtureApi(school, "/school/years/" + year.id + "/days", { token: admin });
    expect(removed.data.some((entry: {schoolDate: string; classId: string | null}) =>
      entry.schoolDate === clock.holiday && entry.classId === null)).toBe(false);
  } finally {
    await school.close();
  }
});
