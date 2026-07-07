// Supabase target. Reads Vite env vars (set at build time — see
// .env.production for prod). In dev it falls back to the local vendored stack
// via Kong on :8000 with the well-known demo anon key. In a production build
// the vars are required: a missing value throws instead of silently shipping a
// demo/localhost target and masking a misconfigured deploy.
const DEV_URL = "http://localhost:8000";
const DEV_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE";

function required(value: string | undefined, devFallback: string, name: string): string {
  if (value) return value;
  if (import.meta.env.DEV) return devFallback;
  throw new Error(`${name} is not set — a production build needs a real Supabase target (see .env.production).`);
}

export const SUPABASE_URL = required(import.meta.env.VITE_SUPABASE_URL, DEV_URL, "VITE_SUPABASE_URL");
export const SUPABASE_KEY = required(import.meta.env.VITE_SUPABASE_ANON_KEY, DEV_ANON_KEY, "VITE_SUPABASE_ANON_KEY");
