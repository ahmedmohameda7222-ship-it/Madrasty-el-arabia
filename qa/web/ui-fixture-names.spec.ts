import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { schoolFixtures } from "../fixtures/school";
import { localOrigin } from "../support/target";

// Only the disposable local Supabase fixture is permitted. No deployed school login.
test("guardian's visible child names are human names, not QA identifiers", async ({ page, context }) => {
  const school = schoolFixtures();
  try {
    await school.seed();
    const token = await school.bearer("guardian-ar", "guardian");
    await context.addCookies([{ name: "madrasty-session", value: token, url: localOrigin, httpOnly: true, sameSite: "Lax" }]);
    await page.route("**/*", (route) => new URL(route.request().url()).origin === localOrigin ? route.continue() : route.abort());

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/ar/school/home");
    const hero = page.locator(".role-hero h2");
    await expect(hero).toBeVisible({ timeout: 30_000 });
    // The child list has no ordering contract; select the long case via the actual dialog.
    await page.locator(".school-content .auth-card .plain-button").first().click();
    const options = page.locator(".scope-sheet .group-row > bdi");
    await expect(options.first()).toBeVisible();
    const labels = await options.allTextContents();
    const longIndex = labels.findIndex((label) => [...label.trim()].length >= 90);
    expect(longIndex, "the linked long-name child exists").toBeGreaterThanOrEqual(0);
    await page.locator(".scope-sheet .group-row").nth(longIndex).click();
    await expect(hero).toHaveText(labels[longIndex].trim());
    const name = (await hero.textContent())?.trim() ?? "";
    expect(name, "fixture run ID must never be displayed as a child's name").not.toMatch(/qa-[a-f0-9]{32}/i);
    expect([...name].length, "long realistic name must be supplied through the fixture data boundary").toBeGreaterThanOrEqual(90);
    expect([...name].length).toBeLessThanOrEqual(120);
    mkdirSync("qa-artifacts/ui-after", { recursive: true });
    await page.screenshot({ path: "qa-artifacts/ui-after/UIX02-guardian-ar-home-390-ready.png", animations: "disabled" });

    await page.goto("/de/school/more/homework");
    const children = page.locator("label.auth-card > select option");
    await expect(children.first()).toBeAttached({ timeout: 30_000 });
    const names = await children.allTextContents();
    expect(names.join(" "), "child selector must contain human names only").not.toMatch(/qa-[a-f0-9]{32}/i);
    expect(names.some((name) => name.trim().split(/\s+/).length === 1), "single-word names should be in the fixture").toBe(true);
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await page.screenshot({ path: "qa-artifacts/ui-after/UIX02-guardian-de-homework-390-ready.png", animations: "disabled" });
  } finally {
    await school.close();
  }
});
