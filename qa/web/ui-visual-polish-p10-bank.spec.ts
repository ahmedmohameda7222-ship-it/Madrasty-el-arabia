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
    const culprits=[...root.querySelectorAll("*")].filter(el=>{const r=el.getBoundingClientRect();return r.width>0 && !el.classList.contains("screen-reader-only") && (r.left<box.left-1 || r.right>box.right+1 || el.scrollWidth>el.clientWidth+1 && getComputedStyle(el).overflowX==="visible");}).slice(0,20).map(el=>({tag:el.tagName,classes:typeof el.className==="string"?el.className:"",width:Math.round(el.getBoundingClientRect().width),scroll:el.scrollWidth,client:el.clientWidth}));
    return { count: targets.length, overflow: Math.max(root.scrollWidth - root.clientWidth, document.documentElement.scrollWidth - innerWidth),
      minWidth: Math.min(...targets.map(t => t.w)), minHeight: Math.min(...targets.map(t => t.h)), within: targets.every(t => t.within), culprits };
  });
}
for (const scene of cases) {
  test(`P10 bank proposal and protected review ${scene.locale}`, async ({ browser, context, page, baseURL }) => {
    const production = baseURL === "https://127.0.0.1:4443";
    const origin = production ? baseURL : localOrigin;
    expect(baseURL).toBe(origin);
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
      const cookies = await context.cookies(origin);
      expect(cookies.some(cookie => cookie.name === (production ? "__Host-madrasty-session" : "madrasty-session") && cookie.httpOnly && (!production || cookie.secure))).toBe(true);
      expect(cookies.some(cookie => cookie.name === (production ? "__Host-madrasty-csrf" : "madrasty-csrf") && !cookie.httpOnly && (!production || cookie.secure))).toBe(true);

      // Use a separate document for the bank route, preserving actual in-page
      // interactions and avoiding a preceding dev Fast Refresh redirect.
      const bank = await context.newPage();
      await bank.setViewportSize({ width: scene.width, height: 844 });
      await bank.emulateMedia({ colorScheme: scene.theme, reducedMotion: "reduce" });
      const route = `/${scene.locale}/school/more/bank`;
      expect((await bank.goto(origin + route))?.status()).toBe(200);
      await expect(bank).toHaveURL(origin + route);
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
      const confirm = panel.getByRole("button", { name: scene.confirm, exact: true });
      const contrast = await confirm.evaluate(el => {
        const color = getComputedStyle(el);
        function luminance(value: string) {
          const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
          if (!channels || channels.length !== 3) throw Error("Expected opaque RGB");
          const linear = channels.map(v => { const x=v/255; return x<=.04045 ? x/12.92 : ((x+.055)/1.055)**2.4; });
          return .2126*linear[0]+.7152*linear[1]+.0722*linear[2];
        }
        const fg=luminance(color.color),bg=luminance(color.backgroundColor);
        return { foreground: color.color, background: color.backgroundColor, ratio:(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05) };
      });
      console.log("P10 bank confirm contrast", JSON.stringify({ locale: scene.locale, ...contrast }));
      const ready = await geometry(bank);
      await bank.screenshot({ path: folder + "/bank-review.png" });
      await bank.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      const large = await geometry(bank);
      await bank.getByRole("heading", { name: scene.title, exact: true, level: 1 }).scrollIntoViewIfNeeded();
      const headingBreaks = await bank.getByRole("heading", { name: scene.title, exact: true, level: 1 }).evaluate(el => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let offset=0, prior: number|undefined; const breaks: number[]=[];
        for (let node=walker.nextNode(); node; node=walker.nextNode()) for(let i=0;i<(node.textContent??"").length;i++) {
          if(node.textContent?.[i]==="\u00ad") continue;
          const range=document.createRange();range.setStart(node,i);range.setEnd(node,i+1);
          const rect=Array.from(range.getClientRects()).filter(r=>r.width>0).at(-1);
          if(!rect) { if(node.textContent?.[i]===" ") {offset++;continue;} throw Error("Missing heading glyph"); }
          if(prior!==undefined&&Math.round(rect.top)!==prior)breaks.push(offset);
          if(node.textContent?.[i]!==" ")prior=Math.round(rect.top);offset++;
        }
        return breaks;
      });
      console.log("P10 bank heading breaks", JSON.stringify({locale:scene.locale,headingBreaks}));
      await bank.screenshot({ path: folder + "/bank-review-text-200.png" });
      await panel.scrollIntoViewIfNeeded();
      await bank.screenshot({ path: folder + "/bank-review-actions-text-200.png" });
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
        if (production) {
          const login = await denied.request.post(origin + "/api/v1/auth/sign-in", {
            headers: { Origin: origin },
            data: { email: fixtureEmail(school.run, "guardian-de"), password: school.password },
          });
          expect(login.status()).toBe(200);
          expect((await denied.cookies(origin)).some(c => c.name === "__Host-madrasty-session" && c.secure && c.httpOnly)).toBe(true);
        } else {
          await denied.addCookies([{ name: "madrasty-session", value: guardian, url: localOrigin, httpOnly: true, sameSite: "Lax" }]);
        }
        const restricted = await denied.newPage();
        // The pre-existing school/loading.tsx may stream before notFound(),
        // so the document status can be 200. Assert the real terminal denial,
        // noindex, no protected controls, unchanged URL and API 403 separately.
        const deniedDocument = await restricted.goto(origin + route);
        expect([200, 404]).toContain(deniedDocument?.status());
        await expect(restricted).toHaveURL(origin + route);
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
      // Soft assertions report both confirmed visual issues without hiding the independent access/retention checks.
      expect.soft(contrast.ratio, "Enabled confirmation text contrast").toBeGreaterThanOrEqual(4.5);
      if(scene.locale==="de") expect.soft(headingBreaks.filter(i=>![3,8,11].includes(i)), "German Zahlungskonto syllable breaks").toEqual([]);
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
