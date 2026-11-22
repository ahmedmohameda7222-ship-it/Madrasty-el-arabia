import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { schoolFixtures } from "../fixtures/school";
import { localOrigin } from "../support/target";

test("90+ character synthetic child name fits guardian hero and academic selector", async ({ page, context }) => {
  const school = schoolFixtures();
  try {
    await school.seed();
    const token = await school.bearer("guardian-de", "guardian");
    await context.addCookies([{ name: "madrasty-session", value: token, url: localOrigin, httpOnly: true, sameSite: "Lax" }]);
    await page.route("**/*", route => new URL(route.request().url()).origin === localOrigin ? route.continue() : route.abort());
    mkdirSync("qa-artifacts/ui-after", { recursive: true });

    for (const locale of ["ar", "de"]) {
      for (const width of [320, 390, 430]) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto("/" + locale + "/school/home");
        const hero = page.locator(".role-hero");
        await expect(hero).toBeVisible();
        await page.locator(".school-content .auth-card .plain-button").first().click();
        const choices = page.locator(".scope-sheet .group-row > bdi");
        await expect(choices.first()).toBeVisible();
        const names = await choices.allTextContents();
        const longIndex = names.findIndex(value => [...value.trim()].length >= 90);
        expect(longIndex).toBeGreaterThanOrEqual(0);
        await page.locator(".scope-sheet .group-row").nth(longIndex).click();
        await expect(hero.locator("h2")).toHaveText(names[longIndex].trim());
        const fullName = names[longIndex].trim();
        await expect(hero).toHaveAttribute("aria-label", fullName);
        const heroBounds = await hero.evaluate(el => {
          const bounds=el.getBoundingClientRect();
          const text=el.querySelector("div");
          const action=el.querySelector(".hero-action");
          const button=action.getBoundingClientRect();
          const main=document.querySelector(".school-content");
          return {left:bounds.left,right:bounds.right,scroll:el.scrollWidth-el.clientWidth,
            textScroll:text.scrollWidth-text.clientWidth,actionLeft:button.left,actionRight:button.right,
            mainScroll:main.scrollWidth-main.clientWidth};
        });
        expect(heroBounds.left).toBeGreaterThanOrEqual(-1);
        expect(heroBounds.right).toBeLessThanOrEqual(width+1);
        expect(heroBounds.scroll, "hero overflow " + locale + width).toBeLessThanOrEqual(1);
        expect(heroBounds.textScroll, "hero text overflow " + locale + width).toBeLessThanOrEqual(1);
        expect(heroBounds.actionLeft).toBeGreaterThanOrEqual(heroBounds.left-1);
        expect(heroBounds.actionRight).toBeLessThanOrEqual(heroBounds.right+1);
        expect(heroBounds.mainScroll, "main overflow from hero").toBeLessThanOrEqual(1);
        await hero.screenshot({path:"qa-artifacts/ui-after/UIX06-"+locale+"-home-"+width+"-hero.png",animations:"disabled"});

        await page.goto("/" + locale + "/school/more/homework");
        const select=page.locator("label.auth-card > select").first();
        await expect(select).toBeVisible();
        const labels=await select.locator("option").allTextContents();
        expect(labels.some(label=>label.includes(fullName)), "full name stays available in select").toBe(true);
        const bounds=await select.evaluate(el=>{
          const rect=el.getBoundingClientRect();
          const main=document.querySelector(".school-content");
          return {left:rect.left,right:rect.right,scroll:main.scrollWidth-main.clientWidth};
        });
        expect(bounds.left).toBeGreaterThanOrEqual(-1);
        expect(bounds.right, "select runs off viewport " + locale + width).toBeLessThanOrEqual(width+1);
        expect(bounds.scroll, "main overflow from select").toBeLessThanOrEqual(1);
        await select.screenshot({path:"qa-artifacts/ui-after/UIX06-"+locale+"-homework-"+width+"-select.png"});

        if (width === 320) {
          await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
          const large = await select.evaluate(el => {
            const rect=el.getBoundingClientRect();
            const main=document.querySelector(".school-content");
            return {right:rect.right,scroll:main.scrollWidth-main.clientWidth};
          });
          expect(large.right).toBeLessThanOrEqual(width+1);
          expect(large.scroll).toBeLessThanOrEqual(1);
          await select.screenshot({path:"qa-artifacts/ui-after/UIX06-"+locale+"-homework-320-200pct.png"});
          await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
        }
      }
    }
  } finally {
    await school.close();
  }
});
