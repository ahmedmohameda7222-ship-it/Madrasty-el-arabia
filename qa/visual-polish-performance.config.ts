import { defineConfig } from "@playwright/test";
import { loadEnvFile } from "node:process";
import { localOrigin } from "./support/target";

loadEnvFile("qa/.env.local");

export default defineConfig({
  testDir: "./visual-polish-performance",
  testMatch: "matched.spec.ts",
  workers: 1,
  timeout: 600_000,
  expect: { timeout: 30_000 },
  outputDir: "../qa-artifacts/visual-polish/P12/test-results",
  use: { baseURL: localOrigin, browserName: "chromium" },
});
