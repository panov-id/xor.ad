import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./specs",
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  // A folder inside the mounted results volume: Playwright clears its output
  // folder first, and a mount point itself cannot be removed.
  outputDir: "results/run",
  use: {
    baseURL: process.env.WEB_URL ?? "http://localhost:4173",
    ...devices["Pixel 5"],
    trace: "retain-on-failure",
  },
});
