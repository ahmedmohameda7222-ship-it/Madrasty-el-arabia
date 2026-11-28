import { expect, test, type Locator } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { schoolFixtures } from "../fixtures/school";
import { setUpCalendar } from "../fixtures/calendar";
import { schoolClock as clock } from "../fixtures/clock";
import { fixtureApi } from "../support/api";
import { localOrigin } from "../support/target";
import { cashbookMonth } from "../../packages/contracts/src/finance/cashbook";
import { invoiceBatch, invoiceDetail, invoicePreview } from "../../packages/contracts/src/finance/invoices";

async function geometry(surface: Locator) {
  return surface.evaluate(el => ({
    radius: parseFloat(getComputedStyle(el).borderTopLeftRadius),
    size: parseFloat(getComputedStyle(el.querySelector("strong")!).fontSize),
    weight: Number(getComputedStyle(el.querySelector("strong")!).fontWeight),
  }));
}
async function financeNavigation(nav: Locator) {
  return nav.evaluate(el => {
    const links = Array.from(el.querySelectorAll("a"));
    return {
      count: links.length,
      active: links.filter(link => link.getAttribute("aria-current") === "page").length,
      overflow: el.scrollWidth - el.clientWidth,
      minimumTarget: Math.min(...links.map(link => Math.min(link.getBoundingClientRect().width, link.getBoundingClientRect().height))),
      brokenWords: links.flatMap(link => {
        const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT);
        const broken: string[] = [];
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          for (const word of (node.textContent ?? "").matchAll(/\S+/gu)) {
            const range = document.createRange();
            range.setStart(node, word.index!);
            range.setEnd(node, word.index! + word[0].length);
            const rows = new Set(Array.from(range.getClientRects()).filter(rect => rect.width > 0).map(rect => Math.round(rect.top)));
            if (rows.size > 1) broken.push(word[0]);
          }
        }
        return broken;
      }),
    };
  });
}

for (const scene of [
  { locale: "de", width: 390, theme: "light", actor: "guardian-de", payer: "Johanna Marie Sophie von Hohenlohe-Langenburg-Wiśniewska-Kowalczyk", child: "ahmed", cash: "Aktueller Kassenbestand", open: "Offene Rechnungen", invoiceBalance: "Offener Betrag" },
  { locale: "ar", width: 320, theme: "dark", actor: "guardian-ar", payer: "سلمى عبد الرحمن محمد", child: "omar", cash: "رصيد الخزنة الحالي", open: "الفواتير غير المدفوعة", invoiceBalance: "المبلغ المتبقي" },
] as const) {
  test(`P10 actual balance and invoice hierarchy ${scene.locale}`, async ({ page, context, browser }) => {
    const school = schoolFixtures();
    const folder = `qa-artifacts/visual-polish/P10/finance-${scene.locale}-${scene.width}/${browser.browserType().name()}`;
    mkdirSync(folder, { recursive: true });
    await context.tracing.start({ screenshots: true, snapshots: true });
    try {
      await school.seed();
      const admin = await school.bearer("admin", "admin");
      const { ids } = await setUpCalendar(school, admin);
      const finance = await school.bearer("finance", "admin");
      const guardian = await school.bearer(scene.actor, "guardian");
      const child = ids[scene.child];
      const payerPath = "/finance/children/" + child + "/payer";
      const payer = (await fixtureApi(school, payerPath, { token: finance, persona: "admin" })).payload.data;
      const choice = payer.choices.find((p: { displayName: string }) => p.displayName === scene.payer);
      expect(choice).toBeTruthy();
      const active = [...payer.designations].filter((p: { effectiveFromMonth: string }) => p.effectiveFromMonth <= clock.month)
        .sort((a: { effectiveFromMonth: string }, b: { effectiveFromMonth: string }) => b.effectiveFromMonth.localeCompare(a.effectiveFromMonth))[0];
      if (active?.guardianId !== choice.id) await fixtureApi(school, payerPath, {
        token: finance, persona: "admin", method: "PUT", key: randomUUID(),
        body: { guardianId: choice.id, effectiveFromMonth: clock.month, revision: payer.revision },
      });
      const amountMinor = 123456;
      const preview = invoicePreview.parse((await fixtureApi(school, "/finance/invoice-previews", {
        token: finance, persona: "admin", method: "POST", key: randomUUID(), status: 201,
        body: { kind: "manual", period: clock.month, studentIds: [child], chargeSourceId: randomUUID(),
          lineItems: [{ titleAr: "رسوم اختبار", titleDe: "QA Gebühr", amountMinor }] },
      })).payload.data);
      expect(preview.rows[0]?.outcome).toBe("ready");
      const batch = invoiceBatch.parse((await fixtureApi(school, "/finance/invoice-batches", {
        token: finance, persona: "admin", method: "POST", key: randomUUID(), status: 201,
        body: { previewId: preview.previewId, revision: preview.revision },
      })).payload.data);
      expect(batch.issuedIds).toHaveLength(1);
      const id = batch.issuedIds[0]!;
      const invoice = invoiceDetail.parse((await fixtureApi(school, "/finance/invoices/" + id, { token: finance })).payload.data);
      expect(invoice.balanceMinor).toBe(amountMinor);
      expect(invoice.state).toBe("unpaid");
      await fixtureApi(school, "/finance/cashbook", { token: finance, persona: "admin", method: "POST", key: randomUUID(),
        status: [200, 201], body: { kind: "donation", date: clock.day, amountMinor: 12345, description: "QA visual geometry" } });
      const cash = cashbookMonth.parse((await fixtureApi(school, "/finance/cashbook?month=" + clock.month, { token: finance })).payload.data);
      const money = (minor: number, currency: string) => new Intl.NumberFormat(scene.locale === "ar" ? "ar-EG" : "de-DE", { style: "currency", currency }).format(minor / 100);
      const root = `/${scene.locale}/school/more`;
      await context.addCookies([{ name: "madrasty-session", value: admin, url: localOrigin, httpOnly: true, sameSite: "Lax" }]);
      await page.setViewportSize({ width: scene.width, height: 844 });
      await page.emulateMedia({ colorScheme: scene.theme, reducedMotion: "reduce" });
      expect((await page.goto(root + "/finance-reports?period=" + clock.month))?.status()).toBe(200);
      const balance = page.getByText(scene.cash, { exact: true }).locator("..");
      await expect(balance.locator("strong bdi")).toHaveText(money(Math.abs(cash.balanceMinor), cash.currency));
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const cashGeometry = await geometry(balance);
      await page.screenshot({ path: folder + "/overview.png" });
      const unpaid = page.getByRole("link", { name: scene.open, exact: true });
      await unpaid.click();
      await expect.poll(() => new URL(page.url()).searchParams.get("state")).toBe("open");
      const invoiceRow = page.locator('a[href*="/invoices?invoice=' + id + '"]');
      await expect(invoiceRow).toBeVisible();
      await invoiceRow.click();
      await expect.poll(() => new URL(page.url()).searchParams.get("invoice")).toBe(id);
      const detail = page.getByText(scene.invoiceBalance, { exact: true }).locator("..");
      await expect(detail.locator("strong bdi")).toHaveText(money(invoice.balanceMinor, invoice.currency));
      await expect(detail.locator("[data-state=unpaid]")).toBeVisible();
      await expect(page.locator('a[href*="/record-payment?invoice=' + id + '"]')).toBeVisible();
      const pdf = page.locator('a[href="/api/v1/finance/invoices/' + id + '/pdf?locale=' + scene.locale + '"]');
      await expect(pdf).toBeVisible();
      const adminGeometry = await geometry(detail);
      const nav = page.getByRole("navigation", { name: scene.locale === "ar" ? "الحسابات" : "Buchhaltung", exact: true });
      await expect(nav.getByRole("link")).toHaveCount(4);
      const navigationNormal = await financeNavigation(nav);
      await page.screenshot({ path: folder + "/invoice.png" });
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      await page.screenshot({ path: folder + "/invoice-text-200.png" });
      const navigationLarge = await financeNavigation(nav);
      console.log("P10 finance navigation", JSON.stringify({ locale: scene.locale, normal: navigationNormal, large: navigationLarge }));
      const overflow = await page.locator(".school-content").evaluate(el => el.scrollWidth - el.clientWidth);
      const payerContext = await browser.newContext({ viewport: { width: scene.width, height: 844 }, colorScheme: scene.theme, reducedMotion: "reduce" });
      let payerGeometry;
      try {
        await payerContext.addCookies([{ name: "madrasty-session", value: guardian, url: localOrigin, httpOnly: true, sameSite: "Lax" }]);
        const payerPage = await payerContext.newPage();
        expect((await payerPage.goto(localOrigin + root + "/invoices?invoice=" + id))?.status()).toBe(200);
        const payerDetail = payerPage.getByText(scene.invoiceBalance, { exact: true }).locator("..");
        await expect(payerDetail.locator("strong bdi")).toHaveText(money(invoice.balanceMinor, invoice.currency));
        await expect(payerPage.locator('a[href*="/record-payment?invoice="]')).toHaveCount(0);
        await expect(payerPage.locator('a[href="/api/v1/finance/invoices/' + id + '/pdf?locale=' + scene.locale + '"]')).toBeVisible();
        payerGeometry = await geometry(payerDetail);
        await payerPage.screenshot({ path: folder + "/payer-invoice.png" });
      } finally { await payerContext.close(); }
      const result = { locale: scene.locale, cashGeometry, adminGeometry, payerGeometry, overflow };
      console.log("P10 finance geometry", JSON.stringify(result));
      writeFileSync(folder + "/geometry.json", JSON.stringify(result, null, 2));
      for (const card of [cashGeometry, adminGeometry, payerGeometry!]) {
        expect(card.radius).toBeGreaterThanOrEqual(22);
        expect(card.size).toBeGreaterThanOrEqual(30);
        expect(card.weight).toBeGreaterThanOrEqual(700);
      }
      expect(overflow).toBeLessThanOrEqual(1);
      for (const navigation of [navigationNormal, navigationLarge]) {
        expect(navigation.count).toBe(4);
        expect(navigation.active).toBe(1);
        expect(navigation.minimumTarget).toBeGreaterThanOrEqual(44);
        expect(navigation.overflow).toBeLessThanOrEqual(1);
        expect(navigation.brokenWords).toEqual([]);
      }
      const unchanged = invoiceDetail.parse((await fixtureApi(school, "/finance/invoices/" + id, { token: finance })).payload.data);
      expect(unchanged.balanceMinor).toBe(invoice.balanceMinor);
      expect(unchanged.revision).toBe(invoice.revision);
    } finally {
      await context.tracing.stop({ path: folder + "/trace.zip" });
      await school.close();
    }
  });
}
