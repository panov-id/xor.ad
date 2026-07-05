import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    // Local dev only: lets the Playwright testing container reach this
    // server via host.docker.internal (see docker-compose.testing.yml).
    allowedHosts: ["host.docker.internal"],
  },
});
