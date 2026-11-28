import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { schoolFixtures } from "../fixtures/school";
import { fixtureEmail, localOrigin } from "../support/target";

const baseline = process.env.VISUAL_POLISH_BASELINE === "1";
const cases = [
  { actor: "guardian-de", persona: "guardian", assurance: "aal1", locale: "de", width: 390, height: 844, scheme: "light" },
  { actor: "guardian-de", persona: "guardian", assurance: "aal1", locale: "ar", width: 320, height: 844, scheme: "dark" },
  { actor: "teacher", persona: "teacher", assurance: "aal1", locale: "ar", width: 430, height: 932, scheme: "light" },
  { actor: "teacher", persona: "teacher", assurance: "aal1", locale: "de", width: 768, height: 1024, scheme: "dark" },
  { actor: "admin", persona: "admin", assurance: "aal2", locale: "de", width: 1280, height: 840, scheme: "light" },
  { actor: "admin", persona: "admin", assurance: "aal1", locale: "ar", width: 390, height: 844, scheme: "dark" },
] as const;

for (const scene of cases) {
  test(`P03 account security ${scene.persona} ${scene.assurance} ${scene.locale} ${scene.width}`, async ({ page, context, browser }) => {
    const school = schoolFixtures();
    const folder = `qa-artifacts/visual-polish/P03/security-${scene.persona}-${scene.assurance}-${scene.locale}-${scene.width}/${browser.browserType().name()}/${baseline ? "before" : "after"}`;
    mkdirSync(folder, { recursive: true });
    try {
      await school.seed();
      const bearer = await school.bearer(scene.actor, scene.persona);
      if (scene.persona === "admin" && scene.assurance === "aal1") {
        // Use the real local sign-in to obtain an unverified web session for
        // an already enrolled synthetic admin. No enrollment secret is captured.
        const login = await context.request.post(localOrigin + "/api/v1/auth/sign-in", {
          headers: { Origin: localOrigin },
          data: { email: fixtureEmail(school.run, scene.actor), password: school.password },
        });
        expect(login.status(), "synthetic admin sign-in").toBe(200);
      } else {
        // No form is submitted in these read-only visual cases.
        await context.addCookies([{ name: "madrasty-session", value: bearer, url: localOrigin, httpOnly: true, sameSite: "Lax" }]);
      }
      await page.setViewportSize({ width: scene.width, height: scene.height });
      await page.emulateMedia({ colorScheme: scene.scheme, reducedMotion: "reduce" });
      const route = `/${scene.locale}/account/security`;
      expect((await page.goto(route))?.status()).toBe(200);
      await expect(page).toHaveURL(localOrigin + route);
      const card = page.locator("main .auth-card");
      await expect(card.getByRole("heading", { level: 1, name: scene.locale === "ar" ? "أمان الحساب" : "Kontosicherheit", exact: true })).toBeVisible();
      const otp = card.locator('input[name="code"]');
      const email = card.locator('input[name="email"]');
      const password = card.locator('input[name="password"]');
      if (scene.persona === "admin") {
        await expect(card.getByRole("heading", { level: 2, name: scene.locale === "ar" ? "التحقق بخطوتين" : "Zwei-Faktor-Verifizierung", exact: true })).toBeVisible();
        await expect(otp).toBeVisible();
        await expect(otp).toHaveAttribute("autocomplete", "one-time-code");
        await expect(otp).toHaveAttribute("dir", "ltr");
        await expect(otp).toHaveAttribute("inputmode", "numeric");
        if (scene.assurance === "aal2") {
          await expect(card.getByRole("status")).toHaveText(scene.locale === "ar" ? "تم التحقق" : "Verifiziert");
        } else {
          await expect(card.getByRole("status")).toHaveCount(0);
        }
      } else {
        await expect(otp).toHaveCount(0);
      }
      if (scene.persona === "admin" && scene.assurance === "aal1") {
        await expect(email).toHaveCount(0);
        await expect(password).toHaveCount(0);
      } else {
        await expect(email).toBeVisible();
        await expect(email).toHaveAttribute("autocomplete", "email");
        await expect(email).toHaveAttribute("type", "email");
        await expect(email).toHaveAttribute("dir", "ltr");
        await expect(password).toBeVisible();
        await expect(password).toHaveAttribute("autocomplete", "current-password");
        await expect(password).toHaveAttribute("type", "password");
      }
      await expect(card.getByRole("alert")).toHaveCount(0);
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const measure = () => card.evaluate(el => {
        const controls = Array.from(el.querySelectorAll("input, button")).filter(node => node.getClientRects().length > 0);
        const boxes = controls.map(node => node.getBoundingClientRect());
        const outer = el.getBoundingClientRect();
        return {
          controls: boxes.length,
          minimumTargetHeight: Math.min(...boxes.map(box => box.height)),
          horizontalOverflow: Math.max(document.documentElement.scrollWidth - innerWidth, el.scrollWidth - el.clientWidth),
          controlsWithinCard: boxes.every(box => box.left >= outer.left - 1 && box.right <= outer.right + 1),
          cardRadius: parseFloat(getComputedStyle(el).borderTopLeftRadius),
        };
      });
      const normal = await measure();
      await page.screenshot({ path: folder + "/security.png" });
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      const large = await measure();
      await page.screenshot({ path: folder + "/security-text-200.png" });
      console.log("P03 security geometry", JSON.stringify({ ...scene, normal, large }));
      writeFileSync(folder + "/geometry.json", JSON.stringify({ ...scene, normal, large }, null, 2));
      for (const result of [normal, large]) {
        expect(result.controls).toBeGreaterThan(0);
        expect(result.minimumTargetHeight).toBeGreaterThanOrEqual(44);
        expect(result.horizontalOverflow).toBeLessThanOrEqual(1);
        expect(result.controlsWithinCard).toBe(true);
      }
      expect(large.controls).toBe(normal.controls);
      await expect(page).toHaveURL(localOrigin + route);
    } finally { await school.close(); }
  });
}
