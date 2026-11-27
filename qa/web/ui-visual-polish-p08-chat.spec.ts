import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { schoolFixtures } from "../fixtures/school";
import { fixtureApi } from "../support/api";
import { localOrigin } from "../support/target";

for (const scene of [
  { locale: "de", width: 390, theme: "light", mic: "Sprachnachricht aufnehmen", attach: "Anhang hinzufügen", contact: "Kontaktinformationen", close: "Schließen" },
  { locale: "ar", width: 320, theme: "dark", mic: "تسجيل رسالة صوتية", attach: "إضافة مرفق", contact: "بيانات جهة الاتصال", close: "إغلاق" },
] as const) {
  test(`P08 direct chat material and retained draft ${scene.locale}`, async ({ page, context, browser }) => {
    const school = schoolFixtures();
    const folder = `qa-artifacts/visual-polish/P08/chat-${scene.locale}-${scene.width}/${browser.browserType().name()}`;
    mkdirSync(folder, { recursive: true });
    await context.tracing.start({ screenshots: true, snapshots: true });
    try {
      await school.seed();
      const guardian = await school.bearer("guardian-de", "guardian");
      const teacher = await school.bearer("teacher", "teacher");
      const contacts = (await fixtureApi(school, "/directory", { token: guardian })).payload.data;
      const target = contacts.find((c: { displayName: string }) => c.displayName === "يوسف عبد الرحمن محمود")?.target;
      expect(target).toBeTruthy();
      const thread = (await fixtureApi(school, "/threads", { token: guardian, persona: "guardian", method: "POST", key: randomUUID(), body: { target } })).payload.data.threadId;
      const outgoing = "QA outgoing " + randomUUID().slice(0, 8);
      const incoming = "QA incoming " + randomUUID().slice(0, 8);
      for (const [token, persona, body] of [[guardian, "guardian", outgoing], [teacher, "teacher", incoming]] as const) {
        const id = randomUUID();
        await fixtureApi(school, `/threads/${thread}/messages`, { token, persona, method: "POST", key: id, status: 201, body: { clientMessageId: id, body } });
      }
      await context.addCookies([{ name: "madrasty-session", value: guardian, url: localOrigin, httpOnly: true, sameSite: "Lax" }]);
      await page.setViewportSize({ width: scene.width, height: 844 });
      await page.emulateMedia({ colorScheme: scene.theme, reducedMotion: "reduce" });
      expect((await page.goto(`/${scene.locale}/school/messages`))?.status()).toBe(200);
      const row = page.locator(".comms-thread-row").filter({ has: page.locator("small", { hasText: incoming }) });
      await expect(row).toBeVisible({ timeout: 20000 });
      await row.click();
      await expect.poll(() => new URL(page.url()).searchParams.get("thread")).toBe(thread);
      const own = page.locator(".comms-message[data-own=true]").filter({ hasText: outgoing });
      const other = page.locator(".comms-message[data-own=false]").filter({ hasText: incoming });
      await expect(own).toBeVisible();
      await expect(other).toBeVisible();
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const shape = async (item: typeof own) => item.evaluate(el => {
        const css = getComputedStyle(el);
        return { top: parseFloat(css.borderTopLeftRadius), bottomLeft: parseFloat(css.borderBottomLeftRadius), bottomRight: parseFloat(css.borderBottomRightRadius), timeSize: parseFloat(getComputedStyle(el.querySelector(".comms-message-time")!).fontSize) };
      });
      const ownShape = await shape(own);
      const otherShape = await shape(other);
      const profile = page.locator(".comms-contact-trigger");
      await expect(profile).toBeVisible();
      const profileSize = await profile.locator("span").evaluate(el => parseFloat(getComputedStyle(el).fontSize));
      const composer = page.locator(".comms-composer");
      const input = composer.locator("textarea");
      const mic = composer.getByRole("button", { name: scene.mic, exact: true });
      const attach = composer.getByRole("button", { name: scene.attach, exact: true });
      await expect(mic).toBeVisible();
      await expect(attach).toBeVisible();
      const micBox = (await mic.boundingBox())!;
      const attachBox = (await attach.boundingBox())!;
      expect(Math.min(micBox.width, micBox.height, attachBox.width, attachBox.height)).toBeGreaterThanOrEqual(44);
      expect(scene.locale === "de" ? micBox.x > attachBox.x : micBox.x < attachBox.x).toBe(true);
      await page.screenshot({ path: folder + "/chat.png" });
      await input.fill("QA retained draft");
      await expect(mic).toHaveCount(0);
      await expect(composer.locator(".comms-send-button")).toBeEnabled();
      await profile.click();
      const dialog = page.getByRole("dialog", { name: scene.contact });
      await expect(dialog).toBeVisible();
      await page.screenshot({ path: folder + "/contact.png" });
      await dialog.getByRole("button", { name: scene.close, exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect(profile).toBeFocused();
      await expect(input).toHaveValue("QA retained draft");
      await input.fill("");
      await expect(mic).toBeVisible();
      expect(new URL(page.url()).searchParams.get("thread")).toBe(thread);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      const geometry = { locale: scene.locale, ownShape, otherShape, profileSize, micBox, attachBox };
      writeFileSync(folder + "/geometry.json", JSON.stringify(geometry, null, 2));
      console.log("P08 chat geometry", JSON.stringify(geometry));
      for (const item of [ownShape, otherShape]) {
        expect(item.top).toBeGreaterThanOrEqual(20);
        expect(item.timeSize).toBeGreaterThanOrEqual(13);
      }
      expect(profileSize).toBeGreaterThanOrEqual(13);
      expect(scene.locale === "de" ? ownShape.bottomRight < ownShape.bottomLeft : ownShape.bottomLeft < ownShape.bottomRight).toBe(true);
      expect(scene.locale === "de" ? otherShape.bottomLeft < otherShape.bottomRight : otherShape.bottomRight < otherShape.bottomLeft).toBe(true);
    } finally {
      await context.tracing.stop({ path: folder + "/trace.zip" });
      await school.close();
    }
  });
}
