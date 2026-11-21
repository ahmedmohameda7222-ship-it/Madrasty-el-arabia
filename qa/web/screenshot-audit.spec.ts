import { test, expect } from "@playwright/test";
import { readdirSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { schoolFixtures, type Persona } from "../fixtures/school";
import { localOrigin } from "../support/target";
import { assertCompleteAudit, selectRetryTargets, summarizeCaptures } from "../screenshot-audit-policy.mjs";

// Screenshot-only audit. All identities and records come from the isolated QA fixture.
// This suite MUST NOT authenticate against the deployed school or modify live data.
const sourceRoot = fileURLToPath(new URL("../../apps/web/src/app/[locale]/", import.meta.url));
const resultsRoot = path.resolve("qa-artifacts/screenshots");
const expandedTabs = ["home", "students", "attendance", "children", "messages", "more"];
type Inventory = { routes: string[]; dynamicTemplates: string[] };

function inventory(): Inventory {
  const routes: string[] = [];
  const dynamicTemplates: string[] = [];
  function visit(folder: string, sections: string[]) {
    for (const item of readdirSync(folder, { withFileTypes: true })) {
      if (item.isFile() && item.name === "page.tsx") {
        routes.push("/" + sections.join("/"));
      }
      if (!item.isDirectory() || item.name.startsWith("(") || item.name.startsWith("@")) continue;
      if (item.name === "[tab]" && sections.join("/") === "school") {
        for (const tab of expandedTabs) visit(path.join(folder, item.name), [...sections, tab]);
      } else if (/^\[.*\]$/.test(item.name)) {
        dynamicTemplates.push("/" + [...sections, item.name].join("/"));
      } else {
        visit(path.join(folder, item.name), [...sections, item.name]);
      }
    }
  }
  visit(sourceRoot, []);
  return { routes: [...new Set(routes)].sort(), dynamicTemplates: [...new Set(dynamicTemplates)].sort() };
}

const audit = inventory();
const retryFile = process.env.QA_AUDIT_RETRY_TARGETS;
const retryTargets: Record<string, { route: string; width: number }[]> | null = retryFile
  ? JSON.parse(readFileSync(path.resolve(retryFile), "utf8")) : null;
const roles: { persona: Persona; principal: "admin" | "teacher" | "guardian-ar" | "guardian-de" }[] = [
  { persona: "admin", principal: "admin" },
  { persona: "teacher", principal: "teacher" },
  { persona: "guardian", principal: "guardian-ar" },
];

for (const role of roles) {
  for (const locale of ["ar", "de"] as const) {
    if (retryTargets && !retryTargets[`${role.persona}-${locale}`]?.length) continue;
    test("Screenshots: " + role.persona + " / " + locale + " / 390px and 1280px", async ({ browser }) => {
      test.setTimeout(20 * 60_000);
      const school = schoolFixtures();
      const key = role.persona + "-" + locale;
      const dest = path.join(resultsRoot, key);
      mkdirSync(dest, { recursive: true });
      const output: {
        persona: string; locale: string; source: string; dynamicTemplates: string[];
        captures: { route: string; width: number; httpStatus?: number; finalPath?: string; files?: string[]; error?: string }[];
      } = { persona: role.persona, locale, source: "isolated-local-qa", dynamicTemplates: audit.dynamicTemplates, captures: [] };
      const expected = retryTargets ? retryTargets[key].length : audit.routes.length * 2 + 1;
      try {
        await school.seed();
        const principal = role.persona === "guardian" && locale === "de" ? "guardian-de" : role.principal;
        const access = await school.bearer(principal, role.persona);
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light", reducedMotion: "reduce" });
        try {
          await context.addCookies([{ name: "madrasty-session", value: access, url: localOrigin, httpOnly: true, sameSite: "Lax" }]);
          const page = await context.newPage();
          await page.route("**/*", route => {
            const origin = new URL(route.request().url()).origin;
            return origin === localOrigin ? route.continue() : route.abort();
          });
          for (const width of [390, 1280]) {
            await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
            for (const route of audit.routes) {
              const pathname = "/" + locale + (route === "/" ? "" : route);
              if (retryTargets && !selectRetryTargets(retryTargets, role.persona, locale, pathname, width)) continue;
              const entry: (typeof output.captures)[number] = { route: pathname, width };
              output.captures.push(entry);
              try {
                const response = await page.goto(localOrigin + pathname, { waitUntil: "domcontentloaded", timeout: 60_000 });
                entry.httpStatus = response?.status();
                entry.finalPath = new URL(page.url()).pathname;
                if (!response || response.status() >= 400 || entry.finalPath.includes("/account/sign-in") && !pathname.includes("/account/sign-in")) {
                  entry.error = "inaccessible or redirected for this persona";
                  continue;
                }
                await page.waitForLoadState("networkidle", { timeout: 2_500 }).catch(() => undefined);
                const slug = (route === "/" ? "root" : route.slice(1).replaceAll("/", "-")).replace(/[^a-zA-Z0-9_-]/g, "_");
                const base = locale + "-" + slug + "-" + width;
                const file = path.join(dest, base + ".png");
                await page.screenshot({ path: file, fullPage: true, animations: "disabled", timeout: 20_000 });
                entry.files = [path.relative("qa-artifacts", file)];
                const main = page.locator("main").first();
                if (await main.count()) {
                  const scroll = await main.evaluate(node => ({ height: node.scrollHeight, visible: node.clientHeight })).catch(() => ({ height: 0, visible: 0 }));
                  if (scroll.height > scroll.visible + 120 && scroll.visible > 0) {
                    await main.evaluate(node => { node.scrollTop = node.scrollHeight; });
                    const bottom = path.join(dest, base + "-bottom.png");
                    await page.screenshot({ path: bottom, fullPage: true, animations: "disabled", timeout: 20_000 });
                    entry.files.push(path.relative("qa-artifacts", bottom));
                    await main.evaluate(node => { node.scrollTop = 0; });
                  }
                }
              } catch (error) {
                entry.error = error instanceof Error ? error.message.slice(0, 250) : "unknown capture error";
              }
            }
          }
          // Preserve old dark-mode shots. The retry must only revisit selected routes.
          if (!retryTargets) {
          await page.setViewportSize({ width: 390, height: 844 });
          await page.emulateMedia({ colorScheme: "dark" });
          await page.goto(localOrigin + "/" + locale + "/school/home", { waitUntil: "domcontentloaded" });
          const dark = path.join(dest, locale + "-home-dark-390.png");
          await page.screenshot({ path: dark, animations: "disabled" });
          output.captures.push({ route: "/" + locale + "/school/home", width: 390, files: [path.relative("qa-artifacts", dark)] });
          }
        } finally {
          await context.close();
        }
      } finally {
        writeFileSync(path.join(dest, "manifest.json"), JSON.stringify({
          ...output, coverage: summarizeCaptures(output.captures, { strictRetry: Boolean(retryTargets) }),
          expectedAttempts: expected,
        }, null, 2));
        await school.close();
      }
      const result = assertCompleteAudit(output.captures, { expected, strictRetry: Boolean(retryTargets) });
      console.log(`Coverage ${key}: ${result.captured} captured, ${result.denied} denied, ${result.failed} failed / ${result.attempted} attempted`);
    });
  }
}
