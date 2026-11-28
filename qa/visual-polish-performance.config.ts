import { defineConfig } from "@playwright/test";
import { loadEnvFile } from "node:process";
import { localOrigin } from "./support/target";

loadEnvFile("qa/.env.local");
const production = process.env.VISUAL_POLISH_RUNTIME === "production";

export default defineConfig({
  testDir: "./visual-polish-performance",
  testMatch: "matched.spec.ts",
  workers: 1,
  timeout: 600_000,
  expect: { timeout: 30_000 },
  outputDir: production ? "../qa-artifacts/visual-polish/P12-production/test-results" : "../qa-artifacts/visual-polish/P12/test-results",
  use: { baseURL: production ? "https://127.0.0.1:4443" : localOrigin, browserName: "chromium", ignoreHTTPSErrors: false },
});
