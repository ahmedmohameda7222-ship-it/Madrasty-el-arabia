import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { schoolFixtures } from "../fixtures/school";
import { fixtureApi } from "../support/api";
import { fixtureEmail, localOrigin } from "../support/target";
import { schoolBank } from "../../packages/contracts/src/finance/bank";

const before = process.env.VISUAL_POLISH_BASELINE === "1";
const cases = [
  { locale: "de", width: 390, theme: "light", title: "Zahlungskonto", current: "Aktives Zahlungskonto", empty: "Das Zahlungskonto ist noch nicht eingerichtet.", beneficiary: "Name des Zahlungsempfängers", iban: "IBAN", review: "Daten prüfen", edit: "Daten bearbeiten", confirm: "Daten bestätigen und verifizieren", name: "QA Schule Madrasty – Synthetischer Zahlungsempfänger für einen langen deutschen Namen ohne echte Bankverbindung" },
  { locale: "ar", width: 320, theme: "dark", title: "حساب التحصيل", current: "الحساب النشط", empty: "حساب التحصيل لسه متسجّلش.", beneficiary: "اسم المستفيد", iban: "آيبان (IBAN)", review: "مراجعة البيانات", edit: "تعديل البيانات", confirm: "تأكيد البيانات والمتابعة للتحقق", name: "مدرسة تجريبية لاختبار عرض اسم المستفيد الطويل دون بيانات مصرفية حقيقية QA" },
] as const;

async function geometry(page: Page) {
  return page.locator(".school-content").evaluate(root => {
    const box = root.getBoundingClientRect();
    const nodes = [...root.querySelectorAll("input, button, nav a")].filter(el => el.getClientRects().length > 0);
    const targets = nodes.map(el => {
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height, within: r.left >= box.left - 1 && r.right <= box.right + 1 };
    });
    return { count: targets.length, overflow: Math.max(root.scrollWidth - root.clientWidth, document.documentElement.scrollWidth - innerWidth),
      minWidth: Math.min(...targets.map(t => t.w)), minHeight: Math.min(...targets.map(t => t.h)), within: targets.every(t => t.within) };
  });
}
for (const scene of cases) {
  test(`P10 bank proposal and protected review ${scene.locale}`, async ({ browser, context, page }) => {
    const school = schoolFixtures();
    const folder = `qa-artifacts/visual-polish/P10/bank-${scene.locale}-${scene.width}/${browser.browserType().name()}/${before ? "before" : "after"}`;
    mkdirSync(folder, { recursive: true });
    try {
      await school.seed();
      const admin = await school.bearer("admin", "admin"); // enroll/verify the synthetic factor
      const settings = schoolBank.parse((await fixtureApi(school, "/finance/bank", { token: admin, persona: "admin" })).payload.data);
      // Exercise actual web sign-in and existing MFA; never bypass the bank guard.
      await page.goto("/de/account/sign-in");
      await page.locator('input[name="email"]').fill(fixtureEmail(school.run, "admin"));
      await page.locator('input[name="password"]').fill(school.password);
      await page.getByRole("button", { name: "Anmelden", exact: true }).click();
      await expect(page).toHaveURL(/\/de\/account\/security$/);
      await page.locator('input[name="code"]').fill((await school.localMfa("admin")).code());
      await page.getByRole("button", { name: "Bestätigen", exact: true }).click();
      await expect(page).toHaveURL(/\/de\/school\/home(?:\?.*)?$/);
      const cookies = await context.cookies(localOrigin);
      expect(cookies.some(cookie => cookie.name === "madrasty-session" && cookie.httpOnly)).toBe(true);
      expect(cookies.some(cookie => cookie.name === "madrasty-csrf" && !cookie.httpOnly)).toBe(true);

      // Use a separate document for the bank route, preserving actual in-page
      // interactions and avoiding a preceding dev Fast Refresh redirect.
      const bank = await context.newPage();
      await bank.setViewportSize({ width: scene.width, height: 844 });
      await bank.emulateMedia({ colorScheme: scene.theme, reducedMotion: "reduce" });
      const route = `/${scene.locale}/school/more/bank`;
      expect((await bank.goto(localOrigin + route))?.status()).toBe(200);
      await expect(bank).toHaveURL(localOrigin + route);
      await expect(bank.getByRole("heading", { name: scene.title, exact: true, level: 1 })).toBeVisible();
      await expect(bank.getByRole("heading", { name: scene.current, exact: true, level: 2 })).toBeVisible();
      const editor = bank.locator(".school-content form").filter({ has: bank.getByLabel(scene.iban, { exact: true }) });
      const name = editor.getByLabel(scene.beneficiary, { exact: true });
      const iban = editor.getByLabel(scene.iban, { exact: true });
      await expect(name).toHaveValue(settings.active?.beneficiary ?? "");
      await expect(iban).toHaveValue(settings.active?.iban ?? "");
      await expect(iban).toHaveAttribute("dir", "ltr");
      if (!settings.active) await expect(bank.getByText(scene.empty, { exact: true })).toBeVisible();
      await bank.evaluate(() => document.fonts.ready.then(() => undefined));
      const initial = await geometry(bank);
      await bank.screenshot({ path: folder + "/bank-initial.png" });

      const review = editor.getByRole("button", { name: scene.review, exact: true });
      await name.fill(scene.name);
      await iban.fill("invalid");
      await expect(review).toBeDisabled();
      // Standard public example IBAN, only used for a non-committing preview.
      const exampleIban = "DE89370400440532013000";
      await iban.fill(exampleIban);
      await expect(review).toBeEnabled();
      const preview = bank.waitForResponse(r => new URL(r.url()).pathname === "/api/v1/finance/bank/preview" && r.request().method() === "POST");
      await review.click();
      expect((await preview).status()).toBe(200);
      const panel = bank.locator("section.notice.auth-form");
      await expect(panel.getByRole("heading", { name: scene.review, exact: true })).toBeVisible();
      await expect(panel.getByText(scene.name, { exact: true })).toBeVisible();
      await expect(panel.locator('bdi[dir="ltr"]')).toHaveText("DE89 3704 0044 0532 0130 00");
      await expect(panel.getByRole("button", { name: scene.confirm, exact: true })).toBeEnabled();
      const ready = await geometry(bank);
      await bank.screenshot({ path: folder + "/bank-review.png" });
      await bank.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      const large = await geometry(bank);
      await bank.screenshot({ path: folder + "/bank-review-text-200.png" });
      for (const action of await panel.getByRole("button").all()) {
        await action.scrollIntoViewIfNeeded();
        await expect(action).toBeInViewport();
      }
      await panel.getByRole("button", { name: scene.edit, exact: true }).click();
      await expect(name).toHaveValue(scene.name);
      await expect(iban).toHaveValue(exampleIban);
      // No step-up challenge or confirmation, and no active bank write.
      expect(schoolBank.parse((await fixtureApi(school, "/finance/bank", { token: admin, persona: "admin" })).payload.data)).toEqual(settings);

      const guardian = await school.bearer("guardian-de", "guardian");
      const deniedApi = await fixtureApi(school, "/finance/bank", { token: guardian, persona: "guardian", status: 403 });
      expect(deniedApi.payload.error.code).toBe("forbidden");
      const denied = await browser.newContext({ viewport: { width: scene.width, height: 844 }, colorScheme: scene.theme });
      try {
        await denied.addCookies([{ name: "madrasty-session", value: guardian, url: localOrigin, httpOnly: true, sameSite: "Lax" }]);
        const restricted = await denied.newPage();
        // The pre-existing school/loading.tsx may stream before notFound(),
        // so the document status can be 200. Assert the real terminal denial,
        // noindex, no protected controls, unchanged URL and API 403 separately.
        const deniedDocument = await restricted.goto(localOrigin + route);
        expect([200, 404]).toContain(deniedDocument?.status());
        await expect(restricted).toHaveURL(localOrigin + route);
        const unavailable = restricted.locator("[data-generic-not-found]");
        await expect(unavailable).toBeVisible();
        await expect(unavailable.getByRole("heading", { name: scene.locale === "de" ? "Seite nicht gefunden" : "الصفحة غير موجودة", exact: true })).toBeVisible();
        await expect(restricted.locator('meta[name="robots"][content*="noindex"]').first()).toHaveAttribute("content", /noindex/);
        await expect(restricted.getByLabel(scene.iban, { exact: true })).toHaveCount(0);
        await expect(restricted.getByRole("heading", { name: scene.current, exact: true })).toHaveCount(0);
        console.log("P10 bank denial", JSON.stringify({ locale: scene.locale, documentStatus: deniedDocument?.status(), apiStatus: deniedApi.response.status }));
        await restricted.screenshot({ path: folder + "/bank-denied.png" });
      } finally { await denied.close(); }
      console.log("P10 bank geometry", JSON.stringify({ locale: scene.locale, initial, ready, large }));
      writeFileSync(folder + "/geometry.json", JSON.stringify({ initial, ready, large }, null, 2));
      for (const state of [initial, ready, large]) {
        expect(state.count).toBeGreaterThan(0);
        expect(state.overflow).toBeLessThanOrEqual(1);
        expect(state.within).toBe(true);
        expect(state.minHeight).toBeGreaterThanOrEqual(44);
        expect(state.minWidth).toBeGreaterThanOrEqual(44);
      }
    } finally { await school.close(); }
  });
}
