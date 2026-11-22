import { defineConfig } from "@playwright/test";
import { loadEnvFile } from "node:process";
import { localOrigin } from "./support/target";

loadEnvFile("qa/.env.local");

export default defineConfig({
  testDir: "./web",
  testMatch: "ui-work-queues-ready.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: "line",
  use: { baseURL: localOrigin, trace: "retain-on-failure", screenshot: "only-on-failure", video: "off" },
  projects: [
    { name: "firefox", use: { browserName: "firefox" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
});
