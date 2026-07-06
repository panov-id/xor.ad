// Landing E2E config. The pages are served by the xor.ad gateway (nginx)
// which routes by hostname; Chromium's host-resolver-rules (see the
// Playwright config) map both faces to 127.0.0.1:8080. The service role
// key is test-only (Supabase's published demo secret) and is used only to
// read back inserted waitlist rows — it never ships to any browser bundle.
export const GATEWAY_PORT = process.env.GATEWAY_PORT ?? "8080";
export const SOSED_URL = `http://sosed.place:${GATEWAY_PORT}`;
export const NEIGHBRO_URL = `http://neighbro.place:${GATEWAY_PORT}`;
export const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://localhost:8000";
export const SERVICE_ROLE_KEY =
  process.env.SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q";
