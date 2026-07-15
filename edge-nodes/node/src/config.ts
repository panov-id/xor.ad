// Node configuration — everything comes from the environment so the image is
// identical on every VPS; only env/secrets differ per node and per environment.

function env(name: string, fallback = ""): string {
  return Deno.env.get(name) ?? fallback;
}

export const config = {
  // Identity — set per node by the wizard (used in health + stored records).
  envName: env("NODE_ENV_NAME", "dev"), // dev | uat | prod
  nodeId: env("NODE_ID", "n0"),
  region: env("NODE_REGION", "unknown"),

  port: Number(env("PORT", "8080")),

  // Origins allowed to call the API (the landing faces).
  allowedOrigins: env("ALLOWED_ORIGINS")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  // Bunny Storage — the v1 store for waitlist + client errors (object per item).
  bunny: {
    host: env("BUNNY_STORAGE_HOST", "storage.bunnycdn.com"),
    zone: env("BUNNY_STORAGE_ZONE"),
    key: env("BUNNY_STORAGE_KEY"),
  },

  // Resend — welcome email on signup.
  resend: {
    key: env("RESEND_API_KEY"),
    from: env("WELCOME_FROM", "sosed <hey@sosed.place>"),
  },
} as const;

export function assertConfig(): void {
  const missing: string[] = [];
  if (!config.bunny.zone) missing.push("BUNNY_STORAGE_ZONE");
  if (!config.bunny.key) missing.push("BUNNY_STORAGE_KEY");
  if (missing.length) {
    console.warn(`[config] missing (waitlist storage disabled): ${missing.join(", ")}`);
  }
  if (!config.resend.key) console.warn("[config] RESEND_API_KEY missing (welcome email disabled)");
}
