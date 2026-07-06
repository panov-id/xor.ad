// Supabase target. Reads Vite env vars (set at build time — see
// .env.production for prod) and falls back to the local vendored stack via
// Kong on :8000 for `npm run dev`. Update the env vars (not this file) to
// point at a real deployed project.
export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? "http://localhost:8000";
export const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE";
