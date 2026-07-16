// Node configuration — everything from the environment so the image is identical
// on every VPS and locally; only env differs per node/env/stack.

function env(name: string, fallback = ""): string {
  return Deno.env.get(name) ?? fallback;
}

export const config = {
  envName: env("NODE_ENV_NAME", "dev"), // dev | uat | prod | local
  nodeId: env("NODE_ID", "n0"),
  region: env("NODE_REGION", "unknown"),
  port: Number(env("PORT", "8080")),

  allowedOrigins: env("ALLOWED_ORIGINS")
    .split(",").map((s) => s.trim()).filter(Boolean),

  // Store: bunny (prod/dev on the pool) or fs (local — objects on a mounted dir).
  storage: {
    transport: env("STORAGE_TRANSPORT", "bunny"), // bunny | fs
    dir: env("STORAGE_DIR", "/data"),
    host: env("BUNNY_STORAGE_HOST", "storage.bunnycdn.com"),
    zone: env("BUNNY_STORAGE_ZONE"),
    key: env("BUNNY_STORAGE_KEY"),
  },

  // Mail: resend (real send) or smtp (Mailpit on dev/local) or none.
  mail: {
    transport: env("MAIL_TRANSPORT", "resend"), // resend | smtp | none
    smtp: { host: env("MAIL_SMTP_HOST", "mailpit"), port: Number(env("MAIL_SMTP_PORT", "1025")) },
  },
  resend: {
    key: env("RESEND_API_KEY"),
    fromOverride: env("WELCOME_FROM"), // optional global sender override
  },
} as const;

export function assertConfig(): void {
  if (config.storage.transport === "bunny" && !(config.storage.zone && config.storage.key)) {
    console.warn("[config] bunny storage not configured (waitlist storage disabled)");
  }
  if (config.mail.transport === "resend" && !config.resend.key) {
    console.warn("[config] RESEND_API_KEY missing (welcome email disabled)");
  }
  console.log(`[config] storage=${config.storage.transport} mail=${config.mail.transport}`);
}
