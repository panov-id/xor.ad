// Which tenant does this public request belong to? Answered by the API key and
// nothing else. The request body used to carry a `brand` hint; it no longer
// decides where data lands, because a value the caller picks is not a boundary.

import { type Brand, config } from "../config.ts";
import { brandByKey } from "./brand_registry.ts";
import { findPublishableKey, originAllowed } from "./api_key.ts";
import { resolveBrand } from "./welcome.ts";
import { json } from "./http.ts";
import { log } from "./log.ts";
import { inc } from "./metrics.ts";

// Every warn line is copied into storage (lib/log.ts), and the keyless path is a
// public route: one line per request would mean an object per request, paid for
// and, worse, a server-log page nobody can read through. The question the line
// answers — "who still has no key" — is a list of callers, not a stream, so one
// line per caller per hour says everything and the counter carries the volume.
const KEYLESS_NOTICE_INTERVAL_MS = 3_600_000;
const keylessNoticedAt = new Map<string, number>();

function noteKeyless(brand: string, origin: string | null): void {
  inc("relay_keyless_requests_total", { brand });
  const caller = `${brand}|${origin ?? "-"}`;
  const last = keylessNoticedAt.get(caller) ?? 0;
  if (Date.now() - last < KEYLESS_NOTICE_INTERVAL_MS) return;
  keylessNoticedAt.set(caller, Date.now());
  log("warn", "keyless public request, brand resolved by hint", { brand, origin });
}

export type TenantResult = { brand: Brand } | { response: Response };

export function isTenantDenied(result: TenantResult): result is { response: Response } {
  return "response" in result;
}

// `hint` is the caller's own source string (the landings send one); it is only
// consulted by the transitional fallback below, never when a key is present.
export async function resolveTenant(req: Request, hint?: string | null): Promise<TenantResult> {
  const id = req.headers.get("x-api-key");
  if (!id) {
    if (config.requireApiKey) return { response: json({ error: "missing x-api-key" }, 401) };
    // Transitional: pre-key landings still resolve by host/source. Logged at
    // warn so the remaining callers are visible in the panel's server log —
    // that list is what says when the flag can be turned on.
    const brand = resolveBrand(hint ?? req.headers.get("origin"));
    noteKeyless(brand.key, req.headers.get("origin"));
    return { brand };
  }

  const key = await findPublishableKey(id);
  // One answer for "no such key", "revoked" and "malformed": a probing caller
  // learns nothing about which of the three it hit.
  if (!key) return { response: json({ error: "invalid api key" }, 401) };

  if (!originAllowed(key, req.headers.get("origin"))) {
    return { response: json({ error: "origin not allowed for this key" }, 403) };
  }

  const brand = await brandByKey(key.brand);
  // A key pointing at a deleted brand is a platform bug, not a caller error.
  if (!brand) return { response: json({ error: "brand unavailable" }, 503) };

  return { brand };
}
