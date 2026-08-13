// Which tenant does this public request belong to? Answered by the API key and
// nothing else. The request body used to carry a `brand` hint; it no longer
// decides where data lands, because a value the caller picks is not a boundary.

import { type Brand, config } from "../config.ts";
import { brandByKey } from "./brand_registry.ts";
import { findPublishableKey, isNative, originAllowed } from "./api_key.ts";
import { EVENTS, exceeded, PAGEVIEWS, record, secondsUntilReset } from "./quota.ts";
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
// The key is partly the caller's own Origin header, so the number of distinct
// callers is whatever a caller decides to send. Entries were never removed:
// cycling the header grew the map without bound and — because a first sighting
// is always "an hour since never" — wrote a warn line, and a stored object, on
// every request. That is precisely what the interval above exists to prevent.
const KEYLESS_CALLERS_MAX = 1000;

function noteKeyless(brand: string, origin: string | null): void {
  inc("relay_keyless_requests_total", { brand });
  const caller = `${brand}|${origin ?? "-"}`;
  const now = Date.now();
  const last = keylessNoticedAt.get(caller) ?? 0;
  if (now - last < KEYLESS_NOTICE_INTERVAL_MS) return;

  // An entry older than the interval can no longer suppress anything, so it is
  // only occupying memory. Swept on the way past rather than on a timer: this is
  // the only thing that writes here, and a timer would keep the process alive.
  for (const [seen, at] of keylessNoticedAt) {
    if (now - at >= KEYLESS_NOTICE_INTERVAL_MS) keylessNoticedAt.delete(seen);
  }
  // And a hard ceiling, because a fast enough caller can outrun the sweep. The
  // cost of forgetting a live entry is one extra line in an hour; the cost of
  // not having a ceiling is the whole map.
  if (keylessNoticedAt.size >= KEYLESS_CALLERS_MAX) keylessNoticedAt.clear();

  keylessNoticedAt.set(caller, now);
  log("warn", "keyless public request, brand resolved by hint", { brand, origin });
}

// Some routes may not be refused, and for them the key answers "through which
// face" and nothing else. A notice under Article 16 is the clearest case: losing
// one because a storefront's key was unknown, revoked, called from an unexpected
// origin or out of daily allowance would be trading a legal obligation for an
// accounting rule. Such a request is **downgraded to unattributed**, never
// rejected.
//
// The quota is deliberately neither checked nor charged here. It is a limit on
// what a key may spend, and an obligation is not spending: the counter is shared
// across every public route, so a storefront that got passed around in a chat
// could otherwise burn its allowance on page views and stop accepting reports of
// illegal content for the rest of the day. What protects this route from a flood
// is its own per-address limit (`REPORT_LIMITS`), which is a bound on volume
// rather than a bound on who may speak.
export async function resolveTenantSoft(
  req: Request,
  hint?: string | null,
): Promise<Brand | null> {
  const id = req.headers.get("x-api-key");
  if (!id) {
    // With keys required, an unkeyed caller is unattributed rather than turned
    // away. Without them, the transitional host/source fallback still applies.
    if (config.requireApiKey) return null;
    const brand = resolveBrand(hint ?? req.headers.get("origin"));
    noteKeyless(brand.key, req.headers.get("origin"));
    return brand;
  }

  const key = await findPublishableKey(id);
  if (!key) return null;
  if (!originAllowed(key, req.headers.get("origin"))) return null;
  return (await brandByKey(key.brand)) ?? null;
}

export type TenantResult = { brand: Brand } | { response: Response };

export function isTenantDenied(result: TenantResult): result is { response: Response } {
  return "response" in result;
}

// `hint` is the caller's own source string (the landings send one); it is only
// consulted by the transitional fallback below, never when a key is present.
// Which allowance this route spends. Defaulted to the forms one, because that
// is what every caller meant when there was only one — and because a new route
// that forgets to say should land on the smaller, older budget rather than
// quietly inventing itself an unmetered one.
export type QuotaFamily = "events" | "pageviews";

export async function resolveTenant(
  req: Request,
  hint?: string | null,
  family: QuotaFamily = "events",
): Promise<TenantResult> {
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

  // The allowance is checked before the work, and counted whether or not the
  // work succeeds: a request that was served is a request that was served, and a
  // caller retrying a failure of ours should not be charged twice — which is why
  // this counts requests admitted, not rows written.
  // A native key is shared by every copy of the client in the world, so a
  // per-key counter is one bucket for everyone: a single script would burn it in
  // a minute and lock the terminal out for the rest of the day, for people who
  // did nothing. The limits that apply to it are per address, and — once
  // identities exist — per identity. Recorded in depth-client §2.5 before it was
  // built; this is the code catching up.
  const metered = !isNative(key);
  const counter = family === "pageviews" ? PAGEVIEWS : EVENTS;
  const limit = family === "pageviews"
    ? key.quota_pageviews_per_day ?? null
    : key.quota_events_per_day ?? null;
  if (metered && await exceeded(key.id, limit, counter)) {
    const retryAfter = secondsUntilReset();
    return {
      response: json(
        {
          error: "daily quota exceeded",
          limit,
          resets_in_seconds: retryAfter,
        },
        429,
        { "retry-after": String(retryAfter) },
      ),
    };
  }
  if (metered) record(key.id, counter);

  return { brand };
}
