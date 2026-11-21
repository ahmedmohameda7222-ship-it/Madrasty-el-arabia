import { defineConfig } from "@playwright/test";
import { loadEnvFile } from "node:process";
import { localOrigin } from "./support/target";

loadEnvFile("qa/.env.local");

export default defineConfig({
  testDir: "./web",
  workers: 1,
  timeout: 40_000,
  reporter: "line",
  outputDir: process.env.LOCALAPPDATA + "/MadrastyBuild/qa-supabase/playwright",
  use: { baseURL: localOrigin, trace: "off", screenshot: "off", video: "off" },
  projects: [
    { name: "edge", use: { browserName: "chromium", channel: "msedge" } },
    { name: "firefox", testIgnore: ["**/attendance-offline.spec.ts", "**/admin-mfa.spec.ts"], use: { browserName: "firefox" } },
    { name: "webkit", testIgnore: ["**/attendance-offline.spec.ts", "**/admin-mfa.spec.ts"], use: { browserName: "webkit" } },
  ],
});
