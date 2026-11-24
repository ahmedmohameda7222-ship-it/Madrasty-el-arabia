import {defineConfig,devices} from "@playwright/test";
import {loadEnvFile} from "node:process";
import {localOrigin} from "./support/target";
loadEnvFile("qa/.env.local");
export default defineConfig({
  testDir:"./web",testMatch:["ui-finance-mobile-ux.spec.ts","ui-finance-populated.spec.ts"],
  workers:1,retries:0,timeout:720_000,expect:{timeout:30_000},
  reporter:[["list"],["json",{outputFile:"../qa-artifacts/ui-finance-ios-results.json"}]],
  outputDir:"../qa-artifacts/ui-finance-ios-test-results",
  use:{baseURL:localOrigin,trace:"retain-on-failure",screenshot:"only-on-failure",video:"off"},
  projects:[{name:"iphone-webkit",use:{...devices["iPhone 13"],browserName:"webkit"}}],
});
