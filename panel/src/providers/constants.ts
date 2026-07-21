// Relay control-plane target. Reads the Vite env var (set at build time — see
// .env.production for prod). In dev it falls back to a local relay stand. In a
// production build the var is required: a missing value throws instead of
// silently shipping a localhost target and masking a misconfigured deploy.
const DEV_URL = "http://localhost:8080";

function required(value: string | undefined, devFallback: string, name: string): string {
  if (value) return value;
  if (import.meta.env.DEV) return devFallback;
  throw new Error(`${name} is not set — a production build needs a real relay target (see .env.production).`);
}

export const API_URL = required(import.meta.env.VITE_RELAY_API_URL, DEV_URL, "VITE_RELAY_API_URL");
