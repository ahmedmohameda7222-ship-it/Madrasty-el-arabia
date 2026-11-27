import { defineConfig } from "@playwright/test";
import { loadEnvFile } from "node:process";
import { localOrigin } from "./support/target";

loadEnvFile("qa/.env.local");

export default defineConfig({
  testDir: "./web",
  testMatch: "ui-visual-polish-*.spec.ts",
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  outputDir: "../qa-artifacts/visual-polish/test-results",
  use: { baseURL: localOrigin },
});
