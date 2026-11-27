import { expect, test, devices } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { schoolFixtures } from "../fixtures/school";
import { localOrigin } from "../support/target";

const stage = process.env.VISUAL_POLISH_BASELINE === "1" ? "before" : process.env.VISUAL_POLISH_RED === "1" ? "red" : "after";
const scenes = [
  { id: "admin-de-ios-light", actor: "admin", persona: "admin", locale: "de", theme: "light", ios: true, width: 390 },
  { id: "teacher-de-desktop-light", actor: "teacher", persona: "teacher", locale: "de", theme: "light", ios: false, width: 1280 },
  { id: "guardian-ar-ios-dark", actor: "guardian-ar", persona: "guardian", locale: "ar", theme: "dark", ios: true, width: 320 },
] as const;

for (const scene of scenes) {
  test(scene.id, async ({ browser }, testInfo) => {
    const school = schoolFixtures();
    const { defaultBrowserType: _, ...iphone } = devices["iPhone 13"];
    const engine = browser.browserType().name();
    const folder = `qa-artifacts/visual-polish/P02/${scene.id}/${stage}${engine === "chromium" ? "" : "-" + engine}`;
    mkdirSync(folder, { recursive: true });
    const context = await browser.newContext({
      ...(scene.ios ? iphone : {}),
      viewport: { width: scene.width, height: 844 },
      colorScheme: scene.theme,
      reducedMotion: "reduce",
      recordVideo: { dir: folder, size: { width: scene.width, height: 844 } },
    });
    await context.tracing.start({ screenshots: true, snapshots: true });
    const page = await context.newPage();
    try {
      await school.seed();
      const token = await school.bearer(scene.actor, scene.persona);
      await context.addCookies([{ name: "madrasty-session", value: token, url: localOrigin, httpOnly: true, sameSite: "Lax" }]);
      const route = `/${scene.locale}/school/home`;
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);
      await expect(page).toHaveURL(localOrigin + route);
      const hero = page.locator(".role-hero");
      const nav = page.locator(".school-nav");
      if (scene.persona === "teacher") await expect(page.getByRole("heading", { name: "Unterricht heute" })).toBeVisible();
      else await expect(hero).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("dir", scene.locale === "ar" ? "rtl" : "ltr");
      await expect(nav.locator("> a")).toHaveCount(5);
      await expect(page.locator(".school-shell")).toHaveAttribute("data-platform", scene.ios ? "ios" : "web");
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const computed = await page.evaluate(() => {
        const style = (selector: string) => getComputedStyle(document.querySelector(selector)!);
        const hero = document.querySelector(".role-hero");
        const navStyle = style(".school-nav");
        return {
          canvas: style("body").backgroundColor,
          heroRadius: hero ? parseFloat(getComputedStyle(hero).borderRadius) : null,
          navRadius: parseFloat(navStyle.borderRadius),
          supportsBlur: CSS.supports("backdrop-filter", "blur(10px)") || CSS.supports("-webkit-backdrop-filter", "blur(10px)"),
          reducedTransparency: matchMedia("(prefers-reduced-transparency: reduce)").matches,
          contrastMore: matchMedia("(prefers-contrast: more)").matches,
          navFilter: navStyle.backdropFilter || navStyle.getPropertyValue("-webkit-backdrop-filter"),
          activeTransition: style(".school-nav a[aria-current]").transitionDuration,
          overflow: document.documentElement.scrollWidth - window.innerWidth,
        };
      });
      expect(computed.overflow).toBeLessThanOrEqual(1);
      expect(computed.activeTransition).toBe("0s");
      await page.screenshot({ path: `${folder}/home.png`, animations: "disabled" });

      const settings = page.locator(".app-settings-trigger");
      await settings.click();
      const dialog = page.locator(".app-settings-sheet[open]");
      await expect(dialog).toBeVisible();
      await expect(dialog.locator(".app-language-options button")).toHaveCount(2);
      await page.screenshot({ path: `${folder}/settings.png`, animations: "disabled" });
      await dialog.locator(".sheet-header button").click();
      await expect(dialog).toHaveCount(0);
      await expect(settings).toBeFocused();
      const more = nav.locator('> a[href$="/school/more"]');
      await more.click();
      await expect(page).toHaveURL(new RegExp("/school/more$"));
      const group = page.locator(".more-group").first();
      await expect(group).toBeVisible();
      await group.locator("summary").click();
      await expect(group).toHaveAttribute("open", "");
      await page.screenshot({ path: `${folder}/more.png`, animations: "disabled" });
      await group.locator("summary").click();
      await expect(group).not.toHaveAttribute("open", "");
      await page.goBack();
      await expect(page).toHaveURL(localOrigin + route);
      const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
      writeFileSync(`${folder}/evidence.json`, JSON.stringify({
        ...scene, sourceSha, worktreeModified: Boolean(execFileSync("git", ["status", "--porcelain", "--untracked-files=no", "--", "apps"], { encoding: "utf8" }).trim()),
        route, finalRoute: new URL(page.url()).pathname, httpStatus: response?.status(), computed,
        engine, browser: browser.version(), project: testInfo.project.name, terminalState: scene.persona === "teacher" ? "today section visible" : "home hero visible",
      }, null, 2));
      if (stage !== "before") {
        if (scene.persona !== "teacher") expect(computed.heroRadius).toBeGreaterThanOrEqual(28);
        if (scene.ios) {
          expect(computed.navRadius).toBeGreaterThanOrEqual(20);
          const shouldBlur = computed.supportsBlur && !computed.reducedTransparency && !computed.contrastMore;
          if (shouldBlur) expect(computed.navFilter, JSON.stringify(computed)).toContain("blur");
          else expect(computed.navFilter).toBe("none");
          if (engine === "chromium" && computed.supportsBlur) {
            const cdp = await context.newCDPSession(page);
            const emulate = (transparency: "reduce" | "no-preference", contrast: "more" | "no-preference") =>
              cdp.send("Emulation.setEmulatedMedia", { features: [
                { name: "prefers-reduced-transparency", value: transparency },
                { name: "prefers-contrast", value: contrast },
                { name: "prefers-reduced-motion", value: "reduce" },
                { name: "prefers-color-scheme", value: scene.theme },
              ] });
            await emulate("no-preference", "no-preference");
            await expect(nav).toHaveCSS("backdrop-filter", "blur(10px)");
            await page.screenshot({ path: `${folder}/home-translucent.png`, animations: "disabled" });
            await emulate("reduce", "no-preference");
            await expect(nav).toHaveCSS("backdrop-filter", "none");
            await emulate("no-preference", "more");
            await expect(nav).toHaveCSS("backdrop-filter", "none");
            await cdp.detach();
          } else {
            await page.emulateMedia({ contrast: "more" });
            await expect(nav).toHaveCSS("backdrop-filter", "none");
          }
        } else {
          expect(computed.navFilter).toBe("none");
        }
      }
    } finally {
      await context.tracing.stop({ path: `${folder}/trace.zip` });
      await context.close();
      const video = page.video();
      if (video) {
        await video.saveAs(`${folder}/video.webm`);
        await video.delete();
      }
      await school.close();
    }
  });
}
