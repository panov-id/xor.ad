// POST /waitlist — capture a signup. Stateless node: validate, dedup + store in
// Bunny Storage (object keyed by hashed email), fire a best-effort welcome email.
// Body: { email, source?, early_access?, lang?, mode? } (matches the landing).

import { config } from "../config.ts";
import { isEmail, json, readJson } from "../lib/http.ts";
import { sha256hex } from "../lib/hash.ts";
import { exists, put, storageEnabled } from "../lib/storage.ts";
import { sendWelcome } from "../lib/resend.ts";

interface Body {
  email?: unknown;
  source?: unknown;
  early_access?: unknown;
  lang?: unknown;
  mode?: unknown;
  accent?: unknown;
}

export async function waitlist(req: Request): Promise<Response> {
  const body = await readJson<Body>(req);
  if (!body || !isEmail(body.email)) return json({ error: "invalid email" }, 422);

  const email = body.email.trim().toLowerCase();
  const lang = typeof body.lang === "string" ? body.lang.slice(0, 8) : "en";
  const record = {
    email,
    source: typeof body.source === "string" ? body.source.slice(0, 120) : null,
    lang,
    mode: typeof body.mode === "string" ? body.mode.slice(0, 16) : null,
    early_access: body.early_access === true,
    node: config.nodeId,
    region: config.region,
    env: config.envName,
    created_at: new Date().toISOString(),
  };

  if (!storageEnabled()) {
    // Don't lose the lead silently — make it loud in logs and still 200 the user.
    console.error("[waitlist] storage disabled, dropping:", email);
    return json({ ok: true, stored: false });
  }

  const key = `waitlist/${config.envName}/${await sha256hex(email)}.json`;

  // Dedup: first signup wins; a repeat is a no-op (and no second welcome email).
  if (await exists(key)) return json({ ok: true, duplicate: true });

  await put(key, record);
  sendWelcome(email, {
    lang,
    accent: typeof body.accent === "string" ? body.accent : "",
    mode: record.mode ?? undefined,
    source: record.source,
  }).catch((e) => console.error("[waitlist] welcome failed", e));
  return json({ ok: true });
}
