import { defineConfig } from "vitest/config";

// Unit tests only, and only beside the code they test. `tests/` is Playwright's
// — those specs need a browser and a stand, and vitest picking them up would
// mean two runners fighting over the same files.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // No jsdom: nothing here renders. What is tested is the logic a component
    // would call, which is the part worth having without a DOM.
    environment: "node",
  },
});
