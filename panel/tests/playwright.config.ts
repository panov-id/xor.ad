import { defineConfig, devices } from "@playwright/test";
import { PANEL_URL } from "./helpers/env";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./global-setup.ts",
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "report", open: "never" }]],
  // A child of the mounted dir, not the mount itself: Playwright clears its
  // output dir before a run, and a bind mount cannot be removed from inside the
  // container.
  outputDir: "results/artifacts",
  use: {
    baseURL: PANEL_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
