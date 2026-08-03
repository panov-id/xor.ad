// POST /waitlist — capture a signup. Stateless node: validate, dedup + store in
// Bunny Storage (object keyed by hashed email), fire a best-effort welcome email.
// Body: { email, source?, early_access?, lang?, mode? } (matches the landing).

import { type Brand, config } from "../config.ts";
import { isEmail, json, readJson } from "../lib/http.ts";
import { sha256hex } from "../lib/hash.ts";
import { storageEnabled } from "../lib/storage.ts";
import { scopedForBrand } from "../lib/scoped_storage.ts";
import { isTenantDenied, resolveTenant } from "../lib/tenant.ts";
import { sendWelcome } from "../lib/mailer.ts";
import { inc } from "../lib/metrics.ts";
import { log } from "../lib/log.ts";

interface Body {
  email?: unknown;
  source?: unknown;
  early_access?: unknown;
  lang?: unknown;
  mode?: unknown;
  accent?: unknown;
  brand?: unknown;
}

export async function waitlist(req: Request): Promise<Response> {
  const body = await readJson<Body>(req);
  if (!body || !isEmail(body.email)) {
    inc("relay_waitlist_total", { result: "invalid" });
    return json({ error: "invalid email" }, 422);
  }

  // The tenant comes from the key, or — transitionally — from the source hint.
  const source = typeof body.source === "string" ? body.source.slice(0, 120) : null;
  const tenant = await resolveTenant(req, source);
  if (isTenantDenied(tenant)) {
    inc("relay_waitlist_total", { result: "no_tenant" });
    return tenant.response;
  }
  return await acceptLead(tenant.brand, body);
}

// Taking a lead, once the tenant is known. Split from the route so the public
// API can call it with the brand its secret key names, rather than forging a
// request for the route to re-resolve — a second path to the same decision is a
// second place for it to be made differently.
export async function acceptLead(brand: Brand, body: Body): Promise<Response> {
  if (!isEmail(body.email)) {
    inc("relay_waitlist_total", { result: "invalid" });
    return json({ error: "invalid email" }, 422);
  }

  const email = body.email.trim().toLowerCase();
  const lang = typeof body.lang === "string" ? body.lang.slice(0, 8) : "en";
  const source = typeof body.source === "string" ? body.source.slice(0, 120) : null;
  const record = {
    email,
    source,
    brand: brand.key,
    lang,
    accent: typeof body.accent === "string" ? body.accent.slice(0, 16) : null,
    mode: typeof body.mode === "string" ? body.mode.slice(0, 16) : null,
    early_access: body.early_access === true,
    node: config.nodeId,
    region: config.region,
    env: config.envName,
    created_at: new Date().toISOString(),
  };

  const lead = (await sha256hex(email)).slice(0, 12);

  if (!storageEnabled()) {
    // Don't lose the lead silently — make it loud in logs and still 200 the user.
    // The address itself is not in the line: a log outlives what it describes and
    // is read by whoever is debugging, so it carries the digest instead.
    log("error", "waitlist storage disabled, dropping lead", { lead });
    inc("relay_waitlist_total", { result: "dropped" });
    return json({ ok: true, stored: false });
  }

  // The same key inside the tenant's own space: one email may now sign up to two
  // brands, which is the point.
  const store = scopedForBrand(brand.key);
  const key = `waitlist/${config.envName}/${await sha256hex(email)}.json`;

  // Dedup: first signup wins; a repeat is a no-op (and no second welcome email).
  //
  // Transitional second look: until migrate_tenants has run, a lead written
  // before tenancy still sits in the pre-migration root, and the tenant's own
  // space is empty. Without this, everyone who signed up before the deploy and
  // submits the form again gets a second welcome email. Retired together with
  // the keyless fallback, by the same flag.
  const seenBefore = await store.exists(key) ||
    (!config.requireApiKey && await scopedForBrand(null).exists(key));
  if (seenBefore) {
    inc("relay_waitlist_total", { result: "duplicate" });
    return json({ ok: true, duplicate: true });
  }

  await store.put(key, record);
  inc("relay_waitlist_total", { result: "ok" });
  sendWelcome(email, {
    lang,
    accent: typeof body.accent === "string" ? body.accent : "",
    mode: record.mode ?? undefined,
    source,
    brand: brand.key,
  }).catch((error) => log("error", "welcome dispatch failed", { lead, error: String(error) }));
  return json({ ok: true });
}
