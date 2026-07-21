// Node configuration — everything from the environment so the image is identical
// on every VPS and locally; only env differs per node/env/stack.

function env(name: string, fallback = ""): string {
  return Deno.env.get(name) ?? fallback;
}

// A brand (face) the node serves. The templates are brand-agnostic; a brand only
// carries its name/domain/sender + how to recognize it. Add brands with the
// BRANDS env (JSON array) — no code change (e.g. a future Asia brand).
export interface Brand {
  key: string; // stable id, e.g. "sosed"
  name: string; // display name in the email body/subject
  upper: string; // wordmark in the email header
  domain: string; // e.g. "sosed.place"
  from: string; // sender, e.g. "сосед <hey@sosed.place>"
  match: string[]; // substrings in source/host that map to this brand
}

const DEFAULT_BRANDS: Brand[] = [
  { key: "sosed", name: "сосед", upper: "СОСЕД", domain: "sosed.place",
    from: "сосед <hey@sosed.place>", match: ["sosed"] },
  { key: "neighbro", name: "Neighbro", upper: "NEIGHBRO", domain: "neighbro.place",
    from: "Neighbro <hello@neighbro.place>", match: ["neighbro"] },
];

function parseBrands(): Brand[] {
  const raw = env("BRANDS"); // full JSON array; replaces the defaults
  if (!raw) return DEFAULT_BRANDS;
  try {
    const arr = JSON.parse(raw) as Array<Partial<Brand> & Pick<Brand, "key" | "name" | "domain" | "from">>;
    return arr.map((b) => ({
      key: b.key, name: b.name, domain: b.domain, from: b.from,
      upper: b.upper ?? b.name.toUpperCase(),
      match: b.match ?? [b.key],
    }));
  } catch (e) {
    console.warn("[config] bad BRANDS json, using defaults:", e);
    return DEFAULT_BRANDS;
  }
}

export const config = {
  envName: env("NODE_ENV_NAME", "dev"), // dev | staging | prod | local
  nodeId: env("NODE_ID", "n0"),
  region: env("NODE_REGION", "unknown"),
  port: Number(env("PORT", "8080")),

  allowedOrigins: env("ALLOWED_ORIGINS")
    .split(",").map((s) => s.trim()).filter(Boolean),

  brands: parseBrands(),

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
    key: env("RESEND_API_KEY"), // default/fallback account key
    // Per-brand account keys (Resend free tier = 1 verified domain per account,
    // so each brand sends from its own domain via its own account). JSON map
    // {brandKey: apiKey}; a brand not listed falls back to `key`.
    keysByBrand: parseResendKeys(),
    fromOverride: env("WELCOME_FROM"), // emergency global sender override (default: per-brand)
  },
} as const;

function parseResendKeys(): Record<string, string> {
  const raw = env("RESEND_KEYS"); // JSON: {"neighbro":"re_…","sosed":"re_…"}
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch (e) {
    console.warn("[config] bad RESEND_KEYS json, ignoring:", e);
    return {};
  }
}

export function brandByKey(key: string): Brand | undefined {
  return config.brands.find((b) => b.key === key);
}

export function assertConfig(): void {
  if (config.storage.transport === "bunny" && !(config.storage.zone && config.storage.key)) {
    console.warn("[config] bunny storage not configured (waitlist storage disabled)");
  }
  if (config.mail.transport === "resend" && !config.resend.key) {
    console.warn("[config] RESEND_API_KEY missing (welcome email disabled)");
  }
  console.log(`[config] storage=${config.storage.transport} mail=${config.mail.transport} `
    + `brands=${config.brands.map((b) => b.key).join(",")}`);
}
