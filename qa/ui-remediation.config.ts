import { defineConfig } from "@playwright/test";
import { loadEnvFile } from "node:process";
import { localOrigin } from "./support/target";

loadEnvFile("qa/.env.local");
export default defineConfig({
  testDir: "./web",
  testMatch: ["ui-fixture-names.spec.ts", "ui-native-controls.spec.ts", "ui-header.spec.ts", "ui-bottom-nav.spec.ts", "ui-long-names.spec.ts"],
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: [["list"], ["json", { outputFile: "../qa-artifacts/ui-fixture-results.json" }]],
  outputDir: "../qa-artifacts/ui-remediation-test-results",
  use: { baseURL: localOrigin, trace: "retain-on-failure", screenshot: "only-on-failure", video: "on" },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
