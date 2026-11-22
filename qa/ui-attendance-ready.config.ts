import { defineConfig } from "@playwright/test";
import { loadEnvFile } from "node:process";
import { localOrigin } from "./support/target";

loadEnvFile("qa/.env.local");
export default defineConfig({
  testDir:"./web",
  testMatch:["ui-attendance-ready.spec.ts","ui-work-queues-ready.spec.ts"],
  workers:1,
  retries:0,
  timeout:180_000,
  expect:{timeout:30000},
  reporter:[["list"],["json",{outputFile:"../qa-artifacts/ui-attendance-ready-results.json"}]],
  outputDir:"../qa-artifacts/ui-attendance-ready-test-results",
  use:{baseURL:localOrigin,trace:"retain-on-failure",screenshot:"only-on-failure",video:"on"},
  projects:[{name:"chromium",use:{browserName:"chromium"}}],
});
