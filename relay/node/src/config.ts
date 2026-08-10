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

// A brand's name is its English one. Everything here is written in English first
// and translated after, so "сосед" is the Russian rendering of this brand rather
// than the brand — it belongs with the other translations, in welcome.ts, and not
// in the identity every letter reads. It leaked out of place the day an English
// letter arrived headed СОСЕД.
const DEFAULT_BRANDS: Brand[] = [
  { key: "sosed", name: "Sosed", upper: "SOSED", domain: "sosed.place",
    from: "Sosed <hey@sosed.place>", match: ["sosed"] },
  { key: "neighbro", name: "Neighbro", upper: "NEIGHBRO", domain: "neighbro.place",
    from: "Neighbro <hello@neighbro.place>", match: ["neighbro"] },
];

// A brand key becomes a path segment under tenants/ (lib/scoped_storage.ts), so
// its shape is a boundary, not a naming convention: "../.." would be a door into
// another tenant's data. Checked at every way in — the env below and the stored
// registry — because self-service tenant registration is on the roadmap and will
// hand the key to someone else to choose.
export const BRAND_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{1,31}$/;

export function isBrandKey(value: unknown): value is string {
  return typeof value === "string" && BRAND_KEY_PATTERN.test(value);
}

function parseBrands(): Brand[] {
  const raw = env("BRANDS"); // full JSON array; replaces the defaults
  if (!raw) return DEFAULT_BRANDS;
  try {
    const arr = JSON.parse(raw) as Array<Partial<Brand> & Pick<Brand, "key" | "name" | "domain" | "from">>;
    const rejected = arr.filter((b) => !isBrandKey(b.key));
    if (rejected.length > 0) {
      // Loud and total: a half-applied brand list would serve some tenants and
      // silently drop others, which is harder to notice than falling back.
      console.warn(
        "[config] BRANDS contains unusable keys, using defaults:",
        rejected.map((b) => String(b.key)).join(", "),
      );
      return DEFAULT_BRANDS;
    }
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

  // Public routes accept an x-api-key that names the tenant. Until every landing
  // sends one (docs/api-platform_*.md, block E), a keyless request still resolves
  // its brand from host/source and says so in the log. Flip to "true" per env
  // once the landings are updated; the fallback goes away with the flag.
  requireApiKey: env("REQUIRE_API_KEY") === "true",

  // The secret Bunny adds by an edge rule. Its presence is what makes an
  // X-Real-IP header worth believing; without it the node counts by the address
  // the connection actually came from. Empty on a node that is not behind the
  // CDN, which is every node today.
  originToken: env("ORIGIN_TOKEN"),

  allowedOrigins: env("ALLOWED_ORIGINS")
    .split(",").map((s) => s.trim()).filter(Boolean),

  brands: parseBrands(),

  // Control state: keys, brands, quotas, the queue. Unset means the node keeps
  // its storage-only behaviour — which is what a stand without Postgres gets,
  // and what every environment gets until the database is wired up.
  databaseUrl: env("DATABASE_URL"),

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

  // Panel control plane: magic-link sessions signed with SESSION_SECRET; the
  // login email links back to PANEL_URL. panelSender = the from for that email
  // (a verified panov.id address, sent via the default Resend key).
  session: { secret: env("SESSION_SECRET") },
  panel: {
    url: env("PANEL_URL"), // e.g. https://xor.panov.id — where the magic link lands
    sender: env("PANEL_SENDER", "xor.panov.id <panel@panov.id>"),
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
