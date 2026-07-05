import { defineConfig, devices } from "@playwright/test";
import { PANEL_URL } from "./helpers/env";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./global-setup.ts",
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "report", open: "never" }]],
  outputDir: "results",
  use: {
    baseURL: PANEL_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
