// Local dev: the vendored self-hosted Supabase stack, via Kong on :8000.
// See xor.ad/supabase/.env (SUPABASE_PUBLIC_URL / ANON_KEY) — update both
// when pointing at a real deployed project.
export const SUPABASE_URL = "http://localhost:8000";
export const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE";
