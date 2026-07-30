// POST /client-error — fire-and-forget client error sink from the landing.
// Low-value/noisy: kept out of the waitlist store, own prefix, capped fields.

import { config } from "../config.ts";
import { json, readJson } from "../lib/http.ts";
import { storageEnabled } from "../lib/storage.ts";
import { scopedForBrand } from "../lib/scoped_storage.ts";
import { isTenantDenied, resolveTenant } from "../lib/tenant.ts";
import { log } from "../lib/log.ts";

function cap(value: unknown, max: number): string | null {
  return typeof value === "string" ? value.slice(0, max) : null;
}

export async function clientError(req: Request): Promise<Response> {
  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return json({ ok: true }); // never argue with a logger

  // Whose error this is still gets decided by the key and never by the body —
  // but a refusal is not an option here. This route is how a landing says
  // anything is wrong at all, so answering 401 to a page with a stale key would
  // silence exactly the report that says the key is stale. The record is kept,
  // unattributed, in the platform's own space, where it is visible as a problem
  // instead of as an absence.
  const tenant = await resolveTenant(req, cap(body.source, 120));
  const brand = isTenantDenied(tenant) ? null : tenant.brand.key;
  return accept(brand, body);
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
    page_url: cap(body.page_url, 500),
    user_agent: cap(body.user_agent, 300),
    source: cap(body.source, 120),
    brand,
    extra: body.extra ?? null,
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
