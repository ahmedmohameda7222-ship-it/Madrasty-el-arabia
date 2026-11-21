import { defineConfig } from "@playwright/test";
import { loadEnvFile } from "node:process";
import { localOrigin } from "./support/target";

loadEnvFile("qa/.env.local");

export default defineConfig({
  testDir: "./web",
  testMatch: "screenshot-audit.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 20 * 60_000,
  reporter: [["list"], ["json", { outputFile: "qa-artifacts/playwright-results.json" }]],
  outputDir: "qa-artifacts/test-results",
  use: {
    baseURL: localOrigin,
    trace: "off",
    screenshot: "off",
    video: "off",
    browserName: "chromium",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
