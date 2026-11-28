import { defineConfig } from "@playwright/test";
import { loadEnvFile } from "node:process";
import { requireFixtureTarget } from "./support/target";

loadEnvFile("qa/.env.local");
requireFixtureTarget(process.env);
if (process.env.GITHUB_ACTIONS !== "true" || process.env.GITHUB_REF !== "refs/heads/visual-polish/premium" ||
    !process.env.NODE_EXTRA_CA_CERTS) throw new Error("Production visual QA requires the disposable TLS fixture.");
export default defineConfig({
  testDir: "./web",
  testMatch: ["ui-visual-polish-entry.spec.ts", "ui-visual-polish-identity.spec.ts", "ui-visual-polish-not-found.spec.ts", "ui-visual-polish-p10-bank.spec.ts", "ui-visual-polish-p09-timetable.spec.ts", "ui-visual-polish-p09-calendar.spec.ts", "ui-visual-polish-p11-headings.spec.ts", "ui-visual-polish-p08-mic.spec.ts", "ui-visual-polish-p07-editors.spec.ts", "ui-visual-polish-p05-child-actions.spec.ts"],
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  outputDir: "../qa-artifacts/visual-polish-production/test-results",
  use: { baseURL: "https://127.0.0.1:4443", ignoreHTTPSErrors: false },
});
