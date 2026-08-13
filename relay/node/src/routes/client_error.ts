// POST /client-error — fire-and-forget client error sink from the landing.
// Low-value/noisy: kept out of the waitlist store, own prefix, capped fields.

import { config } from "../config.ts";
import { json, readJson } from "../lib/http.ts";
import { storageEnabled } from "../lib/storage.ts";
import { scopedForBrand } from "../lib/scoped_storage.ts";
import { resolveTenantSoft } from "../lib/tenant.ts";
import { log } from "../lib/log.ts";
import { callerBucket } from "../lib/client_ip.ts";
import { CLIENT_ERROR_LIMITS, checkAll } from "../lib/rate_limit.ts";

function cap(value: unknown, max: number): string | null {
  return typeof value === "string" ? value.slice(0, max) : null;
}

// The path, without the query or the fragment. The page counter already drops
// them because "one could carry anything", and the same is true of an error
// report — more so, since an error happens on the page a person is actually on,
// with whatever they typed still in the address. The register promises that no
// personal data is written to logs, and a full URL is the easiest way to break
// that promise by accident.
export function pagePath(value: unknown): string | null {
  const raw = cap(value, 500);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`.slice(0, 300);
  } catch {
    // Not a URL — keep the path portion of whatever it is, still without a query.
    return raw.split(/[?#]/)[0].slice(0, 300);
  }
}

// `extra` used to be stored as it arrived: whatever JSON a public caller chose
// to send, of any shape and any size, into a collection the register describes
// as carrying no personal data. The landings use it for one small thing — which
// environment the page thought it was — and that use survives; the freedom to
// post an object of arbitrary depth does not.
//
// Flat, string-valued, bounded on every axis. Anything else is dropped rather
// than coerced: a value we cannot describe is a value we should not keep.
const EXTRA_KEYS = 12;
const EXTRA_KEY_MAX = 40;
const EXTRA_VALUE_MAX = 200;

export function extraFields(value: unknown): Record<string, string> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (Object.keys(out).length >= EXTRA_KEYS) break;
    if (key.length > EXTRA_KEY_MAX) continue;
    if (typeof raw === "string") out[key] = raw.slice(0, EXTRA_VALUE_MAX);
    else if (typeof raw === "number" || typeof raw === "boolean") out[key] = String(raw);
    // objects, arrays, null: dropped
  }
  return Object.keys(out).length ? out : null;
}

export async function clientError(req: Request): Promise<Response> {
  // Before the body is even read. This route needs no key at all, which made it
  // the cheapest way to fill somebody's storage: one POST, one object. The
  // answer is unchanged — a logger is never argued with — and only whether the
  // report is kept depends on this.
  if (!checkAll(CLIENT_ERROR_LIMITS, callerBucket(req)).allowed) {
    return json({ ok: true });
  }

  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return json({ ok: true }); // never argue with a logger

  // Whose error this is still gets decided by the key and never by the body —
  // but a refusal is not an option here. This route is how a landing says
  // anything is wrong at all, so answering 401 to a page with a stale key would
  // silence exactly the report that says the key is stale. The record is kept,
  // unattributed, in the platform's own space, where it is visible as a problem
  // instead of as an absence.
  //
  // The shared helper does that downgrade, and it also stops this route from
  // spending the key's daily allowance: a page reporting that it is broken
  // should not be competing for budget with the page views it is failing to
  // send. The route that must never be refused was /report — this one had the
  // same shape and was quietly paying for it.
  const brand = await resolveTenantSoft(req, cap(body.source, 120));
  return accept(brand?.key ?? null, body);
}

// Storing a report once the tenant is known. Split from the route so the public
// API can pass the brand its secret key names, rather than forging a request for
// the route to resolve again by a rule that knows nothing about secret keys —
// the same split the page counter already makes.
export function acceptClientError(brand: string, body: Record<string, unknown>): Response {
  return accept(brand, body);
}

function accept(brand: string | null, body: Record<string, unknown>): Response {
  const record = {
    kind: cap(body.kind, 64),
    message: cap(body.message, 1000),
    stack: cap(body.stack, 2000),
    page_url: pagePath(body.page_url),
    user_agent: cap(body.user_agent, 300),
    source: cap(body.source, 120),
    brand,
    extra: extraFields(body.extra),
    node: config.nodeId,
    env: config.envName,
    received_at: new Date().toISOString(),
  };

  if (storageEnabled()) {
    // An unattributed record lands in a collection of its own rather than in
    // some tenant's: guessing an owner is the one mistake worse than not knowing.
    const key = brand
      ? `client-errors/${config.envName}/${crypto.randomUUID()}.json`
      : `client-errors-unattributed/${config.envName}/${crypto.randomUUID()}.json`;
    scopedForBrand(brand).put(key, record).catch((error) =>
      log("error", "client-error store failed", { key, error: String(error) })
    );
  }
  return json({ ok: true });
}
