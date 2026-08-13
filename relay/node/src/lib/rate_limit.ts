// A limit per address, held in the node's memory.
//
// Why in memory and not in the database: the point of this limiter is to refuse
// a flood, and a flood that costs a database round trip per request has already
// won half the argument. The cost of keeping it local is that N nodes allow N
// times the limit — which for a threshold measured in a handful per hour is
// noise, and for a threshold that mattered would be the wrong design anyway.
//
// Why not the daily key quota that already exists: that quota counts per key,
// and every visitor to a landing shares one key. A bot that burns it in a minute
// does not get refused — it closes signups for everyone for a day. That is not a
// limit, it is a lever for denial of service, and this exists to take it away.

import { log } from "./log.ts";

interface Bucket {
  hits: number[];
}

// Address -> the timestamps of its recent hits, per named limit.
const buckets = new Map<string, Bucket>();

// Left unbounded, the map is itself a way to exhaust the node: one entry per
// address. Cleared wholesale rather than swept, because the entries are cheap to
// rebuild and a sweep is one more thing to get wrong.
const MAX_TRACKED = 50_000;

export interface Limit {
  name: string;
  max: number;
  windowMs: number;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Two windows rather than one, because they answer different questions. The
// hourly one stops a burst; the daily one stops a patient script that stays just
// under it and grinds all day.
//
// The numbers assume the address is shared. Behind carrier-grade NAT a single
// address can carry a whole cell tower, so a threshold tuned to one person would
// refuse the sixth neighbour on the same operator and look like a broken site.
// Twenty in an hour is no longer "a few people signing up" — it is a script.
export const WAITLIST_LIMITS: Limit[] = [
  { name: "waitlist", max: 20, windowMs: HOUR },
  { name: "waitlist-day", max: 60, windowMs: DAY },
];

// Higher on purpose: refusing a report of illegal content is refusing a legal
// obligation, so the cost of a false refusal here is not an annoyed visitor.
export const REPORT_LIMITS: Limit[] = [
  { name: "report", max: 10, windowMs: HOUR },
  { name: "report-day", max: 40, windowMs: DAY },
];

// The two routes that answer 200 whatever happens had no per-address limit at
// all, which made them the cheapest way to spend somebody else's storage: no
// key needed on one of them, and on the other a key anyone can read out of a
// landing page. The limit does not change the answer — both routes still say
// "fine" — it decides whether the record is kept.
//
// Counted per address AND key, so a noisy visitor on one storefront cannot mute
// that same address for another. The numbers are generous on purpose: a session
// browsing a few pages is nowhere near them, and behind carrier-grade NAT one
// address can be a whole neighbourhood.
export const PAGEVIEW_LIMITS: Limit[] = [
  { name: "pageview", max: 600, windowMs: HOUR },
  { name: "pageview-day", max: 3000, windowMs: DAY },
];

// Lower, because an honest page reports an error rarely and a broken one
// reports the same error in a loop.
export const CLIENT_ERROR_LIMITS: Limit[] = [
  { name: "client-error", max: 60, windowMs: HOUR },
  { name: "client-error-day", max: 300, windowMs: DAY },
];

export interface Verdict {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function check(limit: Limit, address: string, now = Date.now()): Verdict {
  if (buckets.size > MAX_TRACKED) {
    log("info", "rate limiter reset: too many tracked addresses", { tracked: buckets.size });
    buckets.clear();
  }

  const key = `${limit.name}:${address}`;
  const bucket = buckets.get(key) ?? { hits: [] };
  const cutoff = now - limit.windowMs;
  const hits = bucket.hits.filter((at) => at > cutoff);

  if (hits.length >= limit.max) {
    buckets.set(key, { hits });
    const oldest = hits[0];
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + limit.windowMs - now) / 1000)),
    };
  }

  hits.push(now);
  buckets.set(key, { hits });
  return { allowed: true, remaining: limit.max - hits.length, retryAfterSeconds: 0 };
}

// Every window must allow it; the first refusal is the one reported, because
// that is the one the caller has to wait out.
export function checkAll(limits: Limit[], address: string, now = Date.now()): Verdict {
  let allowed: Verdict = { allowed: true, remaining: Number.MAX_SAFE_INTEGER, retryAfterSeconds: 0 };
  for (const limit of limits) {
    const verdict = check(limit, address, now);
    if (!verdict.allowed) return verdict;
    // Report the tightest remaining, so a caller that surfaces it tells the truth
    // about which window runs out first.
    if (verdict.remaining < allowed.remaining) allowed = verdict;
  }
  return allowed;
}

// For tests, and for nothing else: a limiter that cannot be reset is a limiter
// whose tests depend on each other.
export function reset(): void {
  buckets.clear();
}
