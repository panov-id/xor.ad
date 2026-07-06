import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  outputDir: "results",
  use: {
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
    launchOptions: {
      // The gateway routes by Host header; map both faces to the local
      // gateway so real hostname navigation works inside the container.
      args: ["--host-resolver-rules=MAP sosed.place 127.0.0.1, MAP neighbro.place 127.0.0.1"],
    },
  },
});
