import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./specs",
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  // A folder inside the mounted results volume: Playwright clears its output
  // folder first, and a mount point itself cannot be removed. One folder per
  // compose project: stands run side by side, and a shared folder had one
  // run's clearing delete another's traces mid-write (ENOENT in close()).
  outputDir: `results/run-${process.env.E2E_RUN ?? "local"}`,
  use: {
    baseURL: process.env.WEB_URL ?? "http://localhost:4173",
    ...devices["Pixel 5"],
    // The page picks its language from the browser (web/src/locales/say.ts,
    // W13); the specs read the Russian words.
    locale: "ru-RU",
    trace: "retain-on-failure",
    // The cabinet's service is https with the stand's own certificate (A1).
    ignoreHTTPSErrors: true,
  },
});
