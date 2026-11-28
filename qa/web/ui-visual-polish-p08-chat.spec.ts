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
    const started = Date.now();
    const mark = (stage: string) => console.log("P08 stage", JSON.stringify({ locale: scene.locale, engine: browser.browserType().name(), stage, elapsedMs: Date.now() - started }));
    const folder = `qa-artifacts/visual-polish/P08/chat-${scene.locale}-${scene.width}/${browser.browserType().name()}`;
    mkdirSync(folder, { recursive: true });
    // Record bounded, non-identifying navigation/API evidence to distinguish
    // a lost thread selection from a message/composer rendering failure.
    let expectedThread: string | undefined;
    const boundaries: Record<string, unknown>[] = [];
    const record = (event: Record<string, unknown>) => {
      if (boundaries.length === 60) boundaries.shift();
      boundaries.push({ elapsedMs: Date.now() - started, ...event });
    };
    const routeState = (rawUrl: string) => {
      const url = new URL(rawUrl);
      const selection = url.searchParams.get("thread");
      return {
        messagesRoute: url.pathname === `/${scene.locale}/school/messages`,
        threadState: !selection ? "absent" : selection === expectedThread ? "expected" : "other",
      };
    };
    page.on("framenavigated", frame => {
      if (frame === page.mainFrame()) record({ event: "navigation", ...routeState(frame.url()) });
    });
    page.on("response", response => {
      const url = new URL(response.url());
      if (url.origin !== localOrigin || !url.pathname.startsWith("/api/")) return;
      const endpoint = url.pathname.includes("/messages") ? "messages"
        : url.pathname.includes("/threads") ? "threads" : null;
      if (endpoint) record({ event: "api", endpoint, status: response.status(), method: response.request().method() });
    });
    await context.tracing.start({ screenshots: true, snapshots: true });
    try {
      await school.seed();
      mark("seeded");
      const guardian = await school.bearer("guardian-de", "guardian");
      const teacher = await school.bearer("teacher", "teacher");
      mark("sessions-bound");
      const contacts = (await fixtureApi(school, "/directory", { token: guardian })).payload.data;
      const target = contacts.find((c: { displayName: string }) => c.displayName === "يوسف عبد الرحمن محمود")?.target;
      expect(target).toBeTruthy();
      const thread = (await fixtureApi(school, "/threads", { token: guardian, persona: "guardian", method: "POST", key: randomUUID(), body: { target } })).payload.data.threadId;
      expectedThread = thread;
      const outgoing = "QA outgoing " + randomUUID().slice(0, 8);
      const incoming = "QA incoming " + randomUUID().slice(0, 8);
      for (const [token, persona, body] of [[guardian, "guardian", outgoing], [teacher, "teacher", incoming]] as const) {
        const id = randomUUID();
        await fixtureApi(school, `/threads/${thread}/messages`, { token, persona, method: "POST", key: id, status: 201, body: { clientMessageId: id, body } });
      }
      mark("messages-created");
      await context.addCookies([{ name: "madrasty-session", value: guardian, url: localOrigin, httpOnly: true, sameSite: "Lax" }]);
      await page.setViewportSize({ width: scene.width, height: 844 });
      await page.emulateMedia({ colorScheme: scene.theme, reducedMotion: "reduce" });
      expect((await page.goto(`/${scene.locale}/school/messages`))?.status()).toBe(200);
      const row = page.locator(".comms-thread-row").filter({ has: page.locator("small", { hasText: incoming }) });
      await expect(row).toBeVisible({ timeout: 20000 });
      mark("thread-row-visible");
      await row.click();
      mark("thread-clicked");
      await expect.poll(() => new URL(page.url()).searchParams.get("thread")).toBe(thread);
      mark("thread-url-matched");
      const own = page.locator(".comms-message[data-own=true]").filter({ hasText: outgoing });
      const other = page.locator(".comms-message[data-own=false]").filter({ hasText: incoming });
      await expect(own).toBeVisible();
      await expect(other).toBeVisible();
      mark("both-messages-visible");
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
      mark("composer-controls-visible");
      // Read both boxes in the same rendering snapshot; separate locator calls can
      // straddle a polling rerender. Still fail if either control is absent.
      const boxes = await composer.evaluate((el, labels) => {
        function box(label: string) {
          const button = [...el.querySelectorAll("button")].find(node => node.getAttribute("aria-label") === label);
          if (!button) return null;
          const {x,y,width,height} = button.getBoundingClientRect();
          return {x,y,width,height};
        }
        return { mic: box(labels.mic), attach: box(labels.attach) };
      }, {mic: scene.mic, attach: scene.attach});
      expect(boxes.mic, "voice control missing in composer snapshot").not.toBeNull();
      expect(boxes.attach, "attachment control missing in composer snapshot").not.toBeNull();
      const micBox = boxes.mic!;
      const attachBox = boxes.attach!;
      expect(Math.min(micBox.width, micBox.height, attachBox.width, attachBox.height)).toBeGreaterThanOrEqual(44);
      expect(scene.locale === "de" ? micBox.x > attachBox.x : micBox.x < attachBox.x).toBe(true);
      mark("composer-geometry-read");
      await page.screenshot({ path: folder + "/chat.png" });
      mark("chat-image-captured");
      await input.fill("QA retained draft");
      await expect(mic).toHaveCount(0);
      await expect(composer.locator(".comms-send-button")).toBeEnabled();
      mark("draft-entered");
      await profile.click();
      const dialog = page.getByRole("dialog", { name: scene.contact });
      await expect(dialog).toBeVisible();
      mark("contact-dialog-visible");
      await page.screenshot({ path: folder + "/contact.png" });
      await dialog.getByRole("button", { name: scene.close, exact: true }).click();
      await expect(dialog).toBeHidden();
      mark("contact-dialog-closed");
      await expect(profile).toBeFocused();
      mark("contact-focus-restored");
      await expect(input).toHaveValue("QA retained draft");
      mark("draft-retained-and-focus-restored");
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
    } catch (error) {
      // Preserve the original failure and assertions; diagnostics are best effort.
      let dom: unknown = null;
      try {
        dom = await page.evaluate(() => ({
          threadRows: document.querySelectorAll(".comms-thread-row").length,
          messages: document.querySelectorAll(".comms-message").length,
          ownMessages: document.querySelectorAll(".comms-message[data-own=true]").length,
          composerInputs: document.querySelectorAll(".comms-composer textarea").length,
          contactTriggers: document.querySelectorAll(".comms-contact-trigger").length,
          dialogs: document.querySelectorAll('[role="dialog"]').length,
        }));
      } catch {
        // Navigation can destroy the execution context during the failing assertion.
      }
      console.log("P08 failure boundaries", JSON.stringify({
        locale: scene.locale, engine: browser.browserType().name(),
        ...routeState(page.url()), dom, boundaries,
      }));
      throw error;
    } finally {
      mark("trace-stop-start");
      try {
        await context.tracing.stop({ path: folder + "/trace.zip" });
        mark("trace-stop-end");
      } finally {
        await school.close();
        mark("fixture-closed");
      }
    }
  });
}
