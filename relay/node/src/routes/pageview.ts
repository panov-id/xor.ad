// POST /pageview — the landing's own page counter, in place of a third party.
//
// What makes it cookie-free is what it refuses to record: no address, no full
// user agent, no identifier that survives the request. So there is nothing to
// ask consent for, and it runs before the banner is answered — which is the
// whole point, because a counter that only sees the visitors who said yes is a
// counter that lies about the rest.
//
// One object per view, like client errors: the panel reads it through the same
// log explorer, and the same tenant scope decides whose collection it lands in.

import { config } from "../config.ts";
import { json, readJson } from "../lib/http.ts";
import { storageEnabled } from "../lib/storage.ts";
import { scopedForBrand } from "../lib/scoped_storage.ts";
import { isTenantDenied, resolveTenant } from "../lib/tenant.ts";
import { inc } from "../lib/metrics.ts";
import { record as countDaily } from "../lib/pageview_daily.ts";
import { log } from "../lib/log.ts";

function cap(value: unknown, max: number): string | null {
  return typeof value === "string" ? value.slice(0, max) : null;
}

// The referrer's host, never its full URL: the path and query of the page that
// sent someone here are none of our business, and search queries live there.
export function referrerHost(value: unknown): string | null {
  if (typeof value !== "string" || value === "") return null;
  try {
    const url = new URL(value);
    // Web referrers only. "android-app://com.example" parses and yields a host,
    // but that host is a package name, not a site — recording it under the same
    // column would quietly turn app installs into traffic sources.
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.host.slice(0, 120) || null;
  } catch {
    return null;
  }
}

// Buckets, not pixels. A width is a weak fingerprint at full precision and a
// layout decision at this resolution, which is all the number is for.
export function viewport(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  if (value < 640) return "mobile";
  if (value < 1024) return "tablet";
  return "desktop";
}

export async function pageview(req: Request): Promise<Response> {
  const body = await readJson<Record<string, unknown>>(req);
  // Same manners as the error sink: a counter never argues with the page it
  // counts. Every path below answers 200.
  if (!body) return json({ ok: true });

  const tenant = await resolveTenant(req, cap(body.source, 120));
  if (isTenantDenied(tenant)) {
    inc("relay_pageviews_total", { brand: "unknown", result: "no_tenant" });
    return json({ ok: true });
  }
  return accept(tenant.brand.key, body);
}

// Counting a view once the tenant is known. Split from the route so the public
// API can pass the brand its key names, instead of forging a request for the
// route to resolve again by a rule that knows nothing about secret keys.
export function acceptPageview(brand: string, body: Record<string, unknown>): Response {
  return accept(brand, body);
}

function accept(brand: string, body: Record<string, unknown>): Response {
  const record = {
    // The path only — a landing has no query strings worth keeping, and one
    // could carry anything.
    path: cap(body.path, 200),
    lang: cap(body.lang, 8),
    referrer_host: referrerHost(body.referrer),
    viewport: viewport(body.viewport),
    // "first view in this tab", decided by the page via sessionStorage. Not a
    // visitor count and not sold as one: it is the closest honest thing without
    // storing anything on the device that outlives the tab.
    first_in_tab: body.first_in_tab === true,
    source: cap(body.source, 120),
    brand,
    env: config.envName,
    received_at: new Date().toISOString(),
  };

  inc("relay_pageviews_total", { brand, result: "ok" });

  // The count goes to a row, the detail to an object. The row is what survives
  // retention and answers "how many"; the object carries referrer, viewport and
  // the time of day, which the aggregate deliberately does not.
  countDaily(brand, record.path, record.lang, record.first_in_tab);

  if (storageEnabled()) {
    const key = `pageviews/${config.envName}/${crypto.randomUUID()}.json`;
    scopedForBrand(brand).put(key, record).catch((error) =>
      log("error", "pageview store failed", { key, error: String(error) })
    );
  }
  return json({ ok: true });
}
