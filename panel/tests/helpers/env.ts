// Shared config for the panel test suite. Values target the local
// vendored Supabase stack + panel dev server (see docker-compose.*.yml).
// The service role key is test-only (Supabase's published demo secret);
// it never ships to any browser bundle.
export const PANEL_URL = process.env.PANEL_URL ?? "http://localhost:5173";
export const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://localhost:8000";
export const SERVICE_ROLE_KEY =
  process.env.SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q";
export const ANON_KEY =
  process.env.ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE";

// Fixed test identities, seeded/cleaned by global-setup.
export const ADMIN_EMAIL = "test-admin@xor.ad";
export const MODERATOR_EMAIL = "test-moderator@xor.ad";
export const OUTSIDER_EMAIL = "test-outsider@xor.ad";
