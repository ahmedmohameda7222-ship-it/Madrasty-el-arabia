import { expect, test, type Page, type BrowserContext } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { schoolFixtures } from "../fixtures/school";
import { fixtureEmail, localOrigin, requireFixtureTarget } from "../support/target";

type Probe = { pressedAt: number; rafMs: number | null };
type BrowserEvidence = { press: Probe | null; longTasks: { startTime: number; duration: number }[]; supported: boolean };
type ProbeWindow = Window & { __qaMotion: BrowserEvidence };
const production = process.env.VISUAL_POLISH_RUNTIME === "production";
const origin = production ? "https://127.0.0.1:4443" : localOrigin;
const artifactRoot = production ? "P12-production" : "P12";
if (production) {
  requireFixtureTarget(process.env);
  if (process.env.GITHUB_ACTIONS !== "true" || process.env.GITHUB_REF !== "refs/heads/visual-polish/premium" ||
      !process.env.NODE_EXTRA_CA_CERTS) throw new Error("Matched production QA requires isolated TLS.");
}
const stage = process.env.VISUAL_POLISH_STAGE;
const sourceSha = process.env.VISUAL_POLISH_SOURCE_SHA;
if (!stage || !["baseline", "candidate"].includes(stage) || !sourceSha || !/^[a-f0-9]{40}$/.test(sourceSha)) {
  throw new Error("Matched visual performance must identify the exact tested source and stage.");
}

for (const scenario of [
  { actor: "admin", persona: "admin", locale: "de", tab: "students", scheme: "light" },
  { actor: "teacher", persona: "teacher", locale: "de", tab: "attendance", scheme: "light" },
  { actor: "guardian-ar", persona: "guardian", locale: "ar", tab: "children", scheme: "dark" },
] as const) {
  test("matched hosted mobile navigation " + scenario.persona, async ({ browser }) => {
    const school = schoolFixtures();
    const folder = `qa-artifacts/visual-polish/${artifactRoot}/${stage}/${scenario.persona}`;
    mkdirSync(folder, { recursive: true });
    const samples: Record<string, unknown>[] = [];
    const errors: string[] = [];
    const failures: Record<string, unknown>[] = [];
    const requests: { path: string; status: number; durationMs: number | null }[] = [];
    const root = "/" + scenario.locale + "/school/";
    try {
      await school.seed();
      const token = await school.bearer(scenario.actor, scenario.persona);
      // Obtain normal web cookies once before timing. Admin verification uses the
      // existing enrolled synthetic factor; no auth bypass or TLS relaxation.
      let authenticatedState: Awaited<ReturnType<BrowserContext["storageState"]>> | undefined;
      if (production) {
        const auth = await browser.newContext({ baseURL: origin, ignoreHTTPSErrors: false });
        try {
          const login = await auth.request.post(origin + "/api/v1/auth/sign-in", {
            headers: { Origin: origin },
            data: { email: fixtureEmail(school.run, scenario.actor), password: school.password },
          });
          expect(login.status()).toBe(200);
          if (scenario.persona === "admin") {
            const verification = await auth.newPage();
            await verification.goto("/de/account/security");
            await verification.locator('input[name="code"]').fill((await school.localMfa("admin")).code());
            await verification.getByRole("button", { name: "Bestätigen", exact: true }).click();
            await expect(verification).toHaveURL(/\/de\/school\/home(?:\?.*)?$/);
          }
          authenticatedState = await auth.storageState();
          expect(authenticatedState.cookies.some(c => c.name === "__Host-madrasty-session" && c.secure && c.httpOnly && c.path === "/")).toBe(true);
          expect(authenticatedState.cookies.some(c => c.name === "__Host-madrasty-csrf" && c.secure && !c.httpOnly && c.path === "/")).toBe(true);
          // Keep the captured cookies in memory only, never write auth state to artifacts.
          authenticatedState.origins = [];
        } finally { await auth.close(); }
      }
      const open = async () => {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1,
          colorScheme: scenario.scheme, reducedMotion: "no-preference", baseURL: origin, ignoreHTTPSErrors: false, storageState: authenticatedState });
        if (!production) await context.addCookies([{ name: "madrasty-session", value: token, url: localOrigin, httpOnly: true, sameSite: "Lax" }]);
        await context.addInitScript(() => {
          const state: BrowserEvidence = { press: null, longTasks: [], supported: PerformanceObserver.supportedEntryTypes.includes("longtask") };
          (window as ProbeWindow).__qaMotion = state;
          if (state.supported) new PerformanceObserver(list => {
            for (const entry of list.getEntries()) state.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
          }).observe({ type: "longtask", buffered: true });
          document.addEventListener("pointerdown", event => {
            if (!(event.target instanceof Element) || !event.target.closest(".school-nav > a,.app-settings-trigger,.sheet-header button")) return;
            const press = { pressedAt: performance.now(), rafMs: null as number | null };
            state.press = press;
            requestAnimationFrame(() => { press.rafMs = performance.now() - press.pressedAt; });
          }, { capture: true });
        });
        await context.tracing.start({ screenshots: true, snapshots: true });
        const page = await context.newPage();
        page.on("pageerror", error => errors.push(error.name));
        page.on("requestfinished", async request => {
          const url = new URL(request.url());
          if (url.origin !== origin || !url.pathname.startsWith("/api/v1/")) return;
          const path = url.pathname.replace(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/gi, ":id");
          const response = await request.response();
          const timing = request.timing();
          requests.push({ path, status: response?.status() ?? 0, durationMs: timing.responseEnd >= 0 ? Math.round(timing.responseEnd * 100) / 100 : null });
        });
        page.setDefaultTimeout(10_000);
        page.setDefaultNavigationTimeout(30_000);
        return { context, page };
      };
      async function ready(page: Page) {
        const main = page.locator(".school-content");
        await expect(main).toBeVisible();
        await expect(main.locator(".school-route-loading")).toHaveCount(0);
        await expect(main.locator('[data-async-state="loading"]')).toHaveCount(0);
        await expect(main.locator('[data-async-state="error"],[data-async-state="forbidden"]')).toHaveCount(0);
      }
      async function measure(page: Page, mode: string, iteration: number, action: string, operation: () => Promise<void>) {
        const start = await page.evaluate(() => {
          const state = (window as ProbeWindow).__qaMotion;
          state.press = null;
          return { timeOrigin: performance.timeOrigin, now: performance.now() };
        });
        const begin = performance.now();
        const requestStart = requests.length;
        try { await operation(); }
        catch (error) {
          const observed = await page.evaluate(() => ({
            pointerdownObserved: !!(window as ProbeWindow).__qaMotion?.press,
            rafMs: (window as ProbeWindow).__qaMotion?.press?.rafMs ?? null,
            route: location.pathname,
          })).catch(() => null);
          failures.push({ mode, iteration, action, durationMs: Math.round(performance.now()-begin),
            errorType: error instanceof Error ? error.name : "unknown", observed, requests: requests.slice(requestStart) });
          throw error;
        }
        const duration = performance.now() - begin;
        const observed = await page.evaluate(({timeOrigin,now}) => {
          const state = (window as ProbeWindow).__qaMotion;
          const sameDocument = performance.timeOrigin === timeOrigin;
          const tasks = sameDocument && state.supported ? state.longTasks.filter(entry => entry.startTime >= now).map(entry => Math.round(entry.duration * 100) / 100) : null;
          return { sameDocument, firstRafProxyMs: sameDocument ? state.press?.rafMs ?? null : null, longTasks: tasks };
        }, start);
        samples.push({ mode, iteration, action, durationMs: Math.round(duration * 100) / 100, requests: requests.slice(requestStart), ...observed });
      }
      async function exercise(page: Page, mode: string, iteration: number) {
        for (const tab of [scenario.tab, "messages", "calendar", "more", "home"]) {
          const link = page.locator('.school-nav > a[href*="/school/' + tab + '"]');
          await measure(page, mode, iteration, tab, async () => {
            await link.click();
            await expect(page).toHaveURL(new RegExp("/school/" + tab + "(?:\\?.*)?$"));
            await expect(link).toHaveAttribute("aria-current", "page");
            await ready(page);
          });
        }
        const trigger = page.locator(".app-settings-trigger");
        const sheet = page.locator(".app-settings-sheet[open]");
        await measure(page, mode, iteration, "settings-open", async () => {
          await trigger.click();
          await expect(sheet).toBeVisible();
        });
        await measure(page, mode, iteration, "settings-close", async () => {
          await sheet.locator(".sheet-header button").click();
          await expect(sheet).toHaveCount(0);
          await expect(trigger).toBeFocused();
        });
      }
      for (let iteration = 0; iteration < 5; iteration++) {
        const { context, page } = await open();
        try {
          expect((await page.goto(root + "home"))?.status()).toBe(200);
          await ready(page);
          await exercise(page, "fresh-browser-context", iteration);
        } finally {
          try { await context.tracing.stop({ path: folder + "/fresh-" + iteration + ".zip" }); }
          finally { await context.close(); }
        }
      }
      const { context, page } = await open();
      try {
        expect((await page.goto(root + "home"))?.status()).toBe(200);
        await ready(page);
        for (let iteration = 0; iteration < 5; iteration++) await exercise(page, "reused-browser-context", iteration);
      } finally {
        try { await context.tracing.stop({ path: folder + "/reused.zip" }); }
        finally { await context.close(); }
      }
      expect(samples).toHaveLength(70);
      expect(errors).toEqual([]);
    } finally {
      writeFileSync(folder + "/samples.json", JSON.stringify({ stage, sourceSha, scenario, browser: browser.version(),
        viewport: { width: 390, height: 844, dpr: 1 }, runtime: production ? "isolated Next production with verified TLS, same hosted runner and fixture database" : "isolated Next development, same hosted runner and fixture database",
        caveats: ["Fresh browser context is not a cold server reboot.", "First rAF after pointerdown is a scheduling proxy, not verified first visual paint.", "Missing cross-document or unsupported measurements are null.", "Traces remain in the disposable runner."],
        samples, errors, failures }, null, 2));
      await school.close();
    }
  });
}
